const solver = require("javascript-lp-solver");

const COLLAB_WEIGHT = 1000;
const UNASSIGNED_PENALTY = 500;

/**
 * @param {object} params
 * @param {Array<{id:number, name:string, size:number}>} params.departments
 * @param {Array<{id:number, capacity:number, buildingName:string}>} params.floors
 * @param {Array<{deptId:number, floorId:number}>} params.lockedPlacements
 * @param {Array<{deptId:number, partnerId:number}>} params.collaborations
 *
 * @returns {{ assignments: Array<{deptId:number, floorId:number}>, failed: Array, collaborationScore: number }}
 */
function solveAllocation({ departments, floors, lockedPlacements, collaborations }) {
  const lockedMap = new Map(lockedPlacements.map(p => [p.deptId, p.floorId]));

  const freeDepts = departments.filter(d => !lockedMap.has(d.id));

  const model = {
    optimize: "obj",
    opType: "max",
    constraints: {},
    variables: {},
    ints: {},
  };

  const xName = (dId, fId) => `x_${dId}_${fId}`;
  const yName = (dId, kId, fId) => `y_${Math.min(dId, kId)}_${Math.max(dId, kId)}_${fId}`;

  for (const d of freeDepts) {
    const cName = `assign_${d.id}`;
    model.constraints[cName] = { max: 1 };
    for (const f of floors) {
      const name = xName(d.id, f.id);
      if (!model.variables[name]) model.variables[name] = {};
      model.variables[name]["obj"] = 0;
      model.variables[name][cName] = 1;
      model.ints[name] = 1;
    }
  }

  for (const f of floors) {
    const lockedOccupied = lockedPlacements
      .filter(p => p.floorId === f.id)
      .reduce((sum, p) => {
        const d = departments.find(x => x.id === p.deptId);
        return sum + (d ? d.size : 0);
      }, 0);

    const remaining = f.capacity - lockedOccupied;
    const cName = `cap_${f.id}`;
    model.constraints[cName] = { max: remaining };

    for (const d of freeDepts) {
      const name = xName(d.id, f.id);
      if (!model.variables[name]) model.variables[name] = {};
      model.variables[name][cName] = d.size;
    }
  }

  for (const d of freeDepts) {
    const sName = `s_${d.id}`;
    const eqName = `eq_${d.id}`;

    model.constraints[eqName] = { min: 1, max: 1 };

    for (const f of floors) {
      const name = xName(d.id, f.id);
      if (!model.variables[name]) model.variables[name] = {};
      model.variables[name][eqName] = 1;
    }

    model.variables[sName] = {
      obj: -UNASSIGNED_PENALTY,
      [eqName]: 1,
    };
    model.ints[sName] = 1;
    model.constraints[`s_bound_${d.id}`] = { max: 1 };
    model.variables[sName][`s_bound_${d.id}`] = 1;
  }

  let fixedCollaborationScore = 0;
  const semiLockedCollabs = [];

  const collabPairs = [];
  const seen = new Set();
  for (const c of collaborations) {
    const aId = Math.min(c.deptId, c.partnerId);
    const bId = Math.max(c.deptId, c.partnerId);
    const key = `${aId}_${bId}`;
    if (!seen.has(key)) {
      seen.add(key);

      const aLockedFloor = lockedMap.get(aId);
      const bLockedFloor = lockedMap.get(bId);

      if (aLockedFloor !== undefined && bLockedFloor !== undefined) {
        // Oba locked
        if (aLockedFloor === bLockedFloor) fixedCollaborationScore++;
      } else if (aLockedFloor !== undefined || bLockedFloor !== undefined) {
        // Jeden locked, jeden volny
        const lockedFloor = aLockedFloor !== undefined ? aLockedFloor : bLockedFloor;
        const freeDeptId = aLockedFloor !== undefined ? bId : aId;
        semiLockedCollabs.push({ freeDeptId, floorId: lockedFloor });

        const name = xName(freeDeptId, lockedFloor);
        if (!model.variables[name]) model.variables[name] = {};
        model.variables[name]["obj"] = (model.variables[name]["obj"] || 0) + COLLAB_WEIGHT;
      } else {
        // Oba volni
        collabPairs.push({ a: aId, b: bId });
      }
    }
  }

  for (const pair of collabPairs) {
    for (const f of floors) {
      const yN = yName(pair.a, pair.b, f.id);
      const xA = xName(pair.a, f.id);
      const xB = xName(pair.b, f.id);

      model.variables[yN] = { obj: COLLAB_WEIGHT };
      model.ints[yN] = 1;

      // y <= x_a
      const c4 = `c4_${pair.a}_${pair.b}_${f.id}`;
      model.constraints[c4] = { max: 0 };
      model.variables[yN][c4] = 1;
      if (!model.variables[xA]) model.variables[xA] = {};
      model.variables[xA][c4] = -1;

      // y <= x_b
      const c5 = `c5_${pair.a}_${pair.b}_${f.id}`;
      model.constraints[c5] = { max: 0 };
      model.variables[yN][c5] = 1;
      if (!model.variables[xB]) model.variables[xB] = {};
      model.variables[xB][c5] = -1;
    }
  }

  for (const pair of collabPairs) {
    for (let j = 0; j < floors.length; j++) {
      for (let m = j + 1; m < floors.length; m++) {
        const fj = floors[j];
        const fm = floors[m];

        if (fj.buildingName !== fm.buildingName || Math.abs(fj.level - fm.level) > 1) {

          const c1 = `dist_${pair.a}_${pair.b}_${fj.id}_${fm.id}_1`;
          model.constraints[c1] = { max: 1 };
          if (!model.variables[xName(pair.a, fj.id)]) model.variables[xName(pair.a, fj.id)] = {};
          if (!model.variables[xName(pair.b, fm.id)]) model.variables[xName(pair.b, fm.id)] = {};
          model.variables[xName(pair.a, fj.id)][c1] = 1;
          model.variables[xName(pair.b, fm.id)][c1] = 1;

          const c2 = `dist_${pair.a}_${pair.b}_${fj.id}_${fm.id}_2`;
          model.constraints[c2] = { max: 1 };
          if (!model.variables[xName(pair.a, fm.id)]) model.variables[xName(pair.a, fm.id)] = {};
          if (!model.variables[xName(pair.b, fj.id)]) model.variables[xName(pair.b, fj.id)] = {};
          model.variables[xName(pair.a, fm.id)][c2] = 1;
          model.variables[xName(pair.b, fj.id)][c2] = 1;
        }
      }
    }
  }

  for (const semi of semiLockedCollabs) {
    const lockedFloor = floors.find(f => f.id === semi.floorId);
    if (!lockedFloor) continue;

    for (const f of floors) {
      if (f.buildingName !== lockedFloor.buildingName || Math.abs(f.level - lockedFloor.level) > 1) {
        const name = xName(semi.freeDeptId, f.id);
        if (!model.variables[name]) model.variables[name] = {};
        const cForbid = `forbid_${semi.freeDeptId}_${f.id}`;
        model.constraints[cForbid] = { max: 0 };
        model.variables[name][cForbid] = 1;
      }
    }
  }

  const result = solver.Solve(model);

  const assignments = [];

  for (const lp of lockedPlacements) {
    assignments.push({ deptId: lp.deptId, floorId: lp.floorId, locked: true });
  }

  const failed = [];
  for (const d of freeDepts) {
    let assigned = false;
    for (const f of floors) {
      const val = result[xName(d.id, f.id)];
      if (val && Math.round(val) === 1) {
        assignments.push({ deptId: d.id, floorId: f.id, locked: false });
        assigned = true;
        break;
      }
    }
    if (!assigned) {
      failed.push(d);
    }
  }

  let collaborationScore = fixedCollaborationScore;

  for (const semi of semiLockedCollabs) {
    const val = result[xName(semi.freeDeptId, semi.floorId)];
    if (val && Math.round(val) === 1) collaborationScore++;
  }

  for (const pair of collabPairs) {
    for (const f of floors) {
      const val = result[yName(pair.a, pair.b, f.id)];
      if (val && Math.round(val) === 1) { collaborationScore++; break; }
    }
  }

  const totalCollabPairs = fixedCollaborationScore + semiLockedCollabs.length + collabPairs.length;
  return { assignments, failed, collaborationScore, totalCollabPairs };
}

module.exports = { solveAllocation };
