const express = require("express");
const { driver } = require("../db");
const { toNum } = require("../utils/neo4jUtils");
const { solveAllocation } = require("../utils/ilpSolver");

const router = express.Router();

// POST /assignment/run
router.post("/run", async (req, res) => {
  const session = driver.session();
  try {
    const deptRes = await session.run(`
      MATCH (d:Department) 
      OPTIONAL MATCH (d)<-[:WORKS_IN]-(p:Person) 
      RETURN d.id AS id, d.name AS name, count(p) AS size
    `);
    let departments = deptRes.records.map(r => ({
      id: toNum(r.get("id")),
      name: r.get("name"),
      size: toNum(r.get("size"))
    }));

    const floorRes = await session.run(`
      MATCH (b:Building)-[:HAS_FLOOR]->(f:Floor) 
      RETURN f.id AS id, f.capacity AS capacity, f.level AS level, b.name AS buildingName 
      ORDER BY b.id, f.level
    `);
    let floors = floorRes.records.map(r => ({
      id: toNum(r.get("id")),
      capacity: toNum(r.get("capacity")),
      buildingName: r.get("buildingName"),
      occupied: 0,
      assignedDepts: []
    }));

    const lastARes = await session.run(`
      MATCH (a:Assignment) 
      RETURN a.id AS id 
      ORDER BY a.createdAt DESC 
      LIMIT 1
    `);

    let lockedPlacements = [];
    if (lastARes.records.length > 0) {
      const lastId = toNum(lastARes.records[0].get("id"));
      const lockedRes = await session.run(`
        MATCH (a:Assignment {id: $lastId})-[:HAS_PLACEMENT]->(pl:Placement {locked: true})
        MATCH (pl)-[:OF_DEPARTMENT]->(d:Department)
        MATCH (pl)-[:ON_FLOOR]->(f:Floor)
        RETURN d.id AS deptId, f.id AS floorId
      `, { lastId });
      lockedPlacements = lockedRes.records.map(r => ({
        deptId: toNum(r.get("deptId")),
        floorId: toNum(r.get("floorId"))
      }));
    }

    const lockedDeptIds = new Set(lockedPlacements.map(p => p.deptId));
    lockedPlacements.forEach(lp => {
      const d = departments.find(x => x.id === lp.deptId);
      const f = floors.find(x => x.id === lp.floorId);
      if (d && f) {
        f.occupied += d.size;
        f.assignedDepts.push({ ...d, locked: true });
      }
    });

    const collabRes = await session.run(`
      MATCH (d:Department)-[:COLLABORATES_WITH]->(p:Department)
      RETURN d.id AS deptId, p.id AS partnerId
    `);
    const collaborations = collabRes.records.map(r => ({
      deptId: toNum(r.get("deptId")),
      partnerId: toNum(r.get("partnerId"))
    }));

    if (departments.length === 0) {
      return res.status(400).json({ error: "Žádná oddělení k alokaci." });
    }
    if (floors.length === 0) {
      return res.status(400).json({ error: "Žádná dostupná patra k alokaci." });
    }
    const totalCapacity = floors.reduce((sum, f) => sum + f.capacity, 0);
    if (totalCapacity === 0) {
      return res.status(400).json({ error: "Celková kapacita všech dostupných pater je 0." });
    }

    const { assignments, failed, collaborationScore, totalCollabPairs } = solveAllocation({
      departments,
      floors,
      lockedPlacements,
      collaborations,
    });

    const newAssignmentId = Date.now();
    await session.run(`CREATE (a:Assignment {id: $id, createdAt: datetime()})`, { id: newAssignmentId });

    for (const asgn of assignments) {
      await session.run(`
        MATCH (a:Assignment {id:$aId}), (dept:Department {id:$dId}), (fl:Floor {id:$fId})
        CREATE (a)-[:HAS_PLACEMENT]->(pl:Placement {
          id: "PL_"+$aId+"_"+$dId,
          locked: $l,
          updatedAt: datetime(),
          source: "automatic_ilp"
        }),
        (pl)-[:OF_DEPARTMENT]->(dept),
        (pl)-[:ON_FLOOR]->(fl)
      `, { aId: newAssignmentId, dId: asgn.deptId, fId: asgn.floorId, l: asgn.locked });
    }

    res.json({
      success: true,
      details: {
        assignmentId: newAssignmentId,
        totalAssigned: departments.length - failed.length,
        totalFailed: failed.length,
        failedDepartments: failed,
        collaborationScore,
        totalCollabPairs,
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});

// POST /assignments/move
router.post("/move", async (req, res) => {
  const session = driver.session();
  const { departmentId, targetFloorId } = req.body;
  try {
    const dataRes = await session.run(`
      MATCH (d:Department {id: $deptId})
      OPTIONAL MATCH (d)<-[:WORKS_IN]-(p:Person)
      WITH d, count(p) AS deptSize
      MATCH (f:Floor {id: $floorId})
      OPTIONAL MATCH (lastA:Assignment)
      WITH d, deptSize, f, lastA ORDER BY lastA.createdAt DESC LIMIT 1
      /* Výpočet obsazenosti cílového patra v posledním stavu */
      OPTIONAL MATCH (lastA)-[:HAS_PLACEMENT]->(pl:Placement)-[:ON_FLOOR]->(f)
      OPTIONAL MATCH (pl)-[:OF_DEPARTMENT]->(otherD:Department)
      OPTIONAL MATCH (otherD)<-[:WORKS_IN]-(otherP:Person)
      RETURN d.id AS deptId, deptSize, f.id AS floorId, f.capacity AS capacity, 
             count(otherP) AS currentOccupied, lastA.id AS lastAssignmentId
    `, { deptId: Number(departmentId), floorId: Number(targetFloorId) });

    if (dataRes.records.length === 0) return res.status(404).json({ error: "Oddělení nebo patro nebylo nalezeno." });

    const r = dataRes.records[0];
    const dSize = toNum(r.get("deptSize"));
    const cap = toNum(r.get("capacity"));
    const occ = toNum(r.get("currentOccupied"));
    const lastAId = toNum(r.get("lastAssignmentId"));

    if (occ + dSize > cap) {
      return res.status(400).json({
        error: "Nedostatečná kapacita patra.",
        details: { capacity: cap, needed: occ + dSize, currentOccupied: occ }
      });
    }

    const newId = Date.now();
    await session.run(`CREATE (a:Assignment {id: $id, createdAt: datetime()})`, { id: newId });

    if (lastAId) {
      await session.run(`
        MATCH (oldA:Assignment {id: $oldId})-[:HAS_PLACEMENT]->(oldPl:Placement)-[:OF_DEPARTMENT]->(d:Department)
        WHERE d.id <> $movingDeptId
        MATCH (oldPl)-[:ON_FLOOR]->(f:Floor), (newA:Assignment {id: $newId})
        CREATE (newA)-[:HAS_PLACEMENT]->(newPl:Placement {
          id: "PL_"+$newId+"_"+d.id, 
          locked: oldPl.locked, 
          updatedAt: datetime(),
          source: "cloned"
        }),
        (newPl)-[:OF_DEPARTMENT]->(d), 
        (newPl)-[:ON_FLOOR]->(f)
      `, { oldId: lastAId, newId: newId, movingDeptId: Number(departmentId) });
    }

    await session.run(`
      MATCH (newA:Assignment {id: $newId}), (d:Department {id: $deptId}), (f:Floor {id: $fId})
      CREATE (newA)-[:HAS_PLACEMENT]->(pl:Placement {
        id: "PL_"+$newId+"_"+$deptId, 
        locked: true, 
        updatedAt: datetime(),
        source: "manual"
      }),
      (pl)-[:OF_DEPARTMENT]->(d), 
      (pl)-[:ON_FLOOR]->(f)
    `, { newId: newId, deptId: Number(departmentId), fId: Number(targetFloorId) });

    res.json({ success: true, assignmentId: newId, message: "Manuální přesun úspěšný." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});

// DELETE /assignments/:deptId/placement
router.delete("/:deptId/placement", async (req, res) => {
  const session = driver.session();
  const removingDeptId = Number(req.params.deptId);

  if (isNaN(removingDeptId)) return res.status(400).json({ error: "ID oddělení musí být číslo." });

  try {
    const lastARes = await session.run(`
      MATCH (a:Assignment) 
      RETURN a.id AS id ORDER BY a.createdAt DESC LIMIT 1
    `);

    if (lastARes.records.length === 0) {
      return res.status(404).json({ error: "Žádná aktivní alokace nenalezena." });
    }

    const lastAId = toNum(lastARes.records[0].get("id"));
    const newId = Date.now();

    await session.run(`CREATE (a:Assignment {id: $id, createdAt: datetime()})`, { id: newId });

    await session.run(`
      MATCH (oldA:Assignment {id: $oldId})-[:HAS_PLACEMENT]->(oldPl:Placement)-[:OF_DEPARTMENT]->(d:Department)
      WHERE d.id <> $removingDeptId
      MATCH (oldPl)-[:ON_FLOOR]->(f:Floor), (newA:Assignment {id: $newId})
      CREATE (newA)-[:HAS_PLACEMENT]->(newPl:Placement {
        id: "PL_"+$newId+"_"+d.id, 
        locked: oldPl.locked, 
        updatedAt: datetime(),
        source: "cloned_removal"
      }),
      (newPl)-[:OF_DEPARTMENT]->(d), 
      (newPl)-[:ON_FLOOR]->(f)
    `, { oldId: lastAId, newId: newId, removingDeptId: removingDeptId });

    res.json({ success: true, assignmentId: newId, message: "Odebrání týmu z mapy úspěšné." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});

// POST /assignments/clear
router.post("/clear", async (req, res) => {
  const session = driver.session();
  const newId = Date.now();
  try {
    await session.run(`CREATE (a:Assignment {id: $id, createdAt: datetime()})`, { id: newId });
    res.json({ success: true, assignmentId: newId, message: "Mapa vyčištěna." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});

module.exports = router;