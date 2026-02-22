const express = require("express");
const { driver } = require("../db");
const { toNum } = require("../utils/neo4jUtils");

const router = express.Router();

// GET /map - Celkový stav
router.get("/", async (req, res) => {
  const session = driver.session();
  try {
    const aRes = await session.run(`MATCH (a:Assignment) RETURN a.id AS id ORDER BY a.createdAt DESC LIMIT 1`);
    const assignmentId = aRes.records.length ? toNum(aRes.records[0].get("id")) : null;

    const bfRes = await session.run(`
      MATCH (b:Building)
      OPTIONAL MATCH (b)-[:HAS_FLOOR]->(f:Floor)
      RETURN b.id AS buildingId, b.name AS buildingName, f.id AS floorId, f.level AS level, f.capacity AS capacity
      ORDER BY b.id, f.level
    `);

    const buildingById = new Map();
    for (const r of bfRes.records) {
      const bId = toNum(r.get("buildingId"));
      if (!buildingById.has(bId)) buildingById.set(bId, { id: bId, name: r.get("buildingName"), floors: [] });
      const fId = r.get("floorId");
      if (fId !== null) {
        buildingById.get(bId).floors.push({ id: toNum(fId), level: toNum(r.get("level")), capacity: toNum(r.get("capacity")), occupied: 0, departments: [] });
      }
    }
    const buildings = Array.from(buildingById.values());
    const floorById = new Map();
    buildings.forEach(b => b.floors.forEach(f => floorById.set(f.id, f)));

    if (assignmentId !== null && floorById.size > 0) {
      const plRes = await session.run(`
        MATCH (a:Assignment {id: $assignmentId})-[:HAS_PLACEMENT]->(pl:Placement)-[:OF_DEPARTMENT]->(d:Department), (pl)-[:ON_FLOOR]->(f:Floor)
        OPTIONAL MATCH (d)<-[:WORKS_IN]-(p:Person)
        RETURN f.id AS floorId, d.id AS deptId, d.name AS deptName, count(p) AS people, coalesce(pl.locked, false) AS locked
      `, { assignmentId });
      for (const r of plRes.records) {
        const floor = floorById.get(toNum(r.get("floorId")));
        if (floor) {
          const size = toNum(r.get("people"));
          floor.departments.push({ id: toNum(r.get("deptId")), name: r.get("deptName"), size, locked: !!r.get("locked") });
          floor.occupied += size;
        }
      }
    }

    const unassignedQuery = assignmentId === null
      ? `MATCH (d:Department) OPTIONAL MATCH (d)<-[:WORKS_IN]-(p:Person) RETURN d.id AS id, d.name AS name, count(p) AS size ORDER BY id`
      : `MATCH (d:Department) OPTIONAL MATCH (d)<-[:WORKS_IN]-(p:Person) WITH d, count(p) AS size OPTIONAL MATCH (a:Assignment {id: $assignmentId})-[:HAS_PLACEMENT]->(pl:Placement)-[:OF_DEPARTMENT]->(d) WHERE pl IS NULL RETURN d.id AS id, d.name AS name, size ORDER BY id`;
    const unassignedRes = await session.run(unassignedQuery, { assignmentId });
    const unassignedDepartments = unassignedRes.records.map(r => ({ id: toNum(r.get("id")), name: r.get("name"), size: toNum(r.get("size")) }));

    res.json({ assignmentId, buildings, unassignedDepartments });
  } catch (err) { res.status(500).json({ error: err.message }); }
  finally { await session.close(); }
});

// GET /map/:buildingId - Detail jedné budovy + Volné týmy
router.get("/:buildingId", async (req, res) => {
  const session = driver.session();
  const buildingId = Number(req.params.buildingId);
  try {
    const aRes = await session.run(`MATCH (a:Assignment) RETURN a.id AS id ORDER BY a.createdAt DESC LIMIT 1`);
    const assignmentId = aRes.records.length ? toNum(aRes.records[0].get("id")) : null;

    const bRes = await session.run(`MATCH (b:Building {id: $buildingId}) RETURN b.id AS id, b.name AS name`, { buildingId });
    if (bRes.records.length === 0) return res.status(404).json({ error: "Budova nenalezena." });

    const fRes = await session.run(`MATCH (b:Building {id:$buildingId})-[:HAS_FLOOR]->(f:Floor) RETURN f.id AS id, f.level AS level, f.capacity AS capacity ORDER BY level`, { buildingId });
    const floors = fRes.records.map(r => ({ id: toNum(r.get("id")), level: toNum(r.get("level")), capacity: toNum(r.get("capacity")), occupied: 0, departments: [] }));
    const floorById = new Map(floors.map(f => [f.id, f]));

    if (assignmentId !== null && floors.length > 0) {
      const plRes = await session.run(`
        MATCH (a:Assignment {id: $assignmentId})-[:HAS_PLACEMENT]->(pl:Placement)-[:OF_DEPARTMENT]->(d:Department), (pl)-[:ON_FLOOR]->(f:Floor)<-[:HAS_FLOOR]-(b:Building {id:$buildingId})
        OPTIONAL MATCH (d)<-[:WORKS_IN]-(p:Person)
        RETURN f.id AS floorId, d.id AS deptId, d.name AS deptName, count(p) AS people, coalesce(pl.locked, false) AS locked
      `, { assignmentId, buildingId });
      for (const r of plRes.records) {
        const floor = floorById.get(toNum(r.get("floorId")));
        if (floor) {
          const size = toNum(r.get("people"));
          floor.departments.push({ id: toNum(r.get("deptId")), name: r.get("deptName"), size, locked: !!r.get("locked") });
          floor.occupied += size;
        }
      }
    }

    const unassignedQuery = assignmentId === null
      ? `MATCH (d:Department) OPTIONAL MATCH (d)<-[:WORKS_IN]-(p:Person) RETURN d.id AS id, d.name AS name, count(p) AS size ORDER BY id`
      : `MATCH (d:Department) OPTIONAL MATCH (d)<-[:WORKS_IN]-(p:Person) WITH d, count(p) AS size OPTIONAL MATCH (a:Assignment {id: $assignmentId})-[:HAS_PLACEMENT]->(pl:Placement)-[:OF_DEPARTMENT]->(d) WHERE pl IS NULL RETURN d.id AS id, d.name AS name, size ORDER BY id`;
    const unassignedRes = await session.run(unassignedQuery, { assignmentId });
    const unassignedDepartments = unassignedRes.records.map(r => ({ id: toNum(r.get("id")), name: r.get("name"), size: toNum(r.get("size")) }));

    res.json({ assignmentId, building: { id: toNum(bRes.records[0].get("id")), name: bRes.records[0].get("name") }, floors, unassignedDepartments });
  } catch (err) { res.status(500).json({ error: err.message }); }
  finally { await session.close(); }
});

module.exports = router;