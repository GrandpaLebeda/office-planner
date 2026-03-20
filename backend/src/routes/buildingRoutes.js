const express = require("express");
const { driver } = require("../db");
const { toNum } = require("../utils/neo4jUtils");

const router = express.Router();

// GET /buildings
router.get("/", async (req, res) => {
  const session = driver.session();
  try {
    const result = await session.run(`MATCH (b:Building) RETURN b.id AS id, b.name AS name ORDER BY id`);
    res.json(result.records.map(r => ({ id: toNum(r.get("id")), name: r.get("name") })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});

// POST /buildings
router.post("/", async (req, res) => {
  const session = driver.session();
  const { name } = req.body;

  if (!name || name.trim().length < 2) return res.status(400).json({ error: "Název budovy musí mít alespoň 2 znaky." });

  try {
    const check = await session.run(
      "MATCH (b:Building) WHERE b.name = $name RETURN b",
      { name: name.trim() }
    );

    if (check.records.length > 0) {
      return res.status(409).json({ error: "Budova se stejným názvem již existuje." });
    }

    const idResult = await session.run(`
      MATCH (b:Building) 
      RETURN coalesce(max(b.id), 0) + 1 AS nextId
    `);
    const nextId = toNum(idResult.records[0].get("nextId"));

    const result = await session.run(`
      CREATE (b:Building {id: $id, name: $name})
      RETURN b.id AS id, b.name AS name
    `, { id: nextId, name: name.trim() });

    const r = result.records[0];
    res.status(201).json({ id: toNum(r.get("id")), name: r.get("name") });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});


// PUT /buildings/:id
router.put("/:id", async (req, res) => {
  const session = driver.session();
  const id = Number(req.params.id);
  const { name } = req.body;

  if (isNaN(id)) return res.status(400).json({ error: "ID budovy musí být číslo." });
  if (!name || name.trim().length < 2) return res.status(400).json({ error: "Název budovy musí mít alespoň 2 znaky." });

  try {
    const checkDuplicate = await session.run(
      "MATCH (b:Building) WHERE b.name = $name AND b.id <> $id RETURN b",
      { id, name: name.trim() }
    );

    if (checkDuplicate.records.length > 0) {
      return res.status(409).json({ error: "Budova se stejným názvem již existuje." });
    }

    const result = await session.run(`
      MATCH (b:Building {id: $id})
      SET b.name = $name
      RETURN b.id AS id, b.name AS name
    `, { id, name: name.trim() });

    if (result.records.length === 0) {
      return res.status(404).json({ error: "Budova s tímto ID nebyla nalezena." });
    }

    const r = result.records[0];
    res.json({ id: toNum(r.get("id")), name: r.get("name") });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});

// DELETE /buildings/:id
router.delete("/:id", async (req, res) => {
  const session = driver.session();
  const id = Number(req.params.id);

  if (isNaN(id)) return res.status(400).json({ error: "ID budovy musí být číslo." });

  try {
    const result = await session.run(`
      MATCH (b:Building {id: $id})
      OPTIONAL MATCH (b)-[:HAS_FLOOR]->(f:Floor)
      DETACH DELETE b, f
      RETURN count(b) as deletedCount
    `, { id });

    if (toNum(result.records[0].get("deletedCount")) === 0) {
      return res.status(404).json({ error: "Budova s tímto ID nebyla nalezena." });
    }

    res.json({ success: true, message: `Budova ID ${id} a její patra byla smazána.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});

// GET /buildings/:id/floors
router.get("/:id/floors", async (req, res) => {
  const session = driver.session();
  const buildingId = Number(req.params.id);

  if (isNaN(buildingId)) return res.status(400).json({ error: "ID budovy musí být číslo." });

  try {
    const result = await session.run(`
      MATCH (b:Building {id: $buildingId})-[:HAS_FLOOR]->(f:Floor)
      RETURN b.id AS buildingId, b.name AS buildingName, f.id AS id, f.level AS level, f.capacity AS capacity
      ORDER BY level
    `, { buildingId });

    if (result.records.length === 0) {
      const bCheck = await session.run("MATCH (b:Building {id: $buildingId}) RETURN b", { buildingId });
      if (bCheck.records.length === 0) return res.status(404).json({ error: "Budova nenalezena." });

      return res.json({ buildingId, floors: [] });
    }

    const first = result.records[0];
    res.json({
      building: { id: toNum(first.get("buildingId")), name: first.get("buildingName") },
      floors: result.records.map(r => ({
        id: toNum(r.get("id")),
        level: toNum(r.get("level")),
        capacity: toNum(r.get("capacity"))
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});

// POST /buildings/:id/floors
router.post("/:id/floors", async (req, res) => {
  const session = driver.session();
  const buildingId = Number(req.params.id);
  const { level, capacity } = req.body;

  if (isNaN(buildingId)) return res.status(400).json({ error: "ID budovy musí být číslo." });
  if (isNaN(Number(level)) || Number(level) < 0) return res.status(400).json({ error: "Level patra musí být nezáporné číslo." });
  if (isNaN(Number(capacity)) || Number(capacity) <= 0) return res.status(400).json({ error: "Kapacita musí být kladné číslo." });

  try {
    const check = await session.run(`
      MATCH (b:Building {id: $buildingId})
      OPTIONAL MATCH (b)-[:HAS_FLOOR]->(f:Floor {level: $level})
      RETURN b, f
    `, { buildingId, level: Number(level) });

    if (check.records.length === 0) return res.status(404).json({ error: "Budova neexistuje." });
    if (check.records[0].get("f") !== null) {
      return res.status(400).json({ error: `Patro na levelu ${level} již v této budově existuje.` });
    }

    const floorId = buildingId * 100 + Number(level);

    const result = await session.run(`
      MATCH (b:Building {id:$buildingId})
      CREATE (f:Floor {id:$floorId, level:$level, capacity:$capacity})
      CREATE (b)-[:HAS_FLOOR]->(f)
      RETURN f.id AS id, f.level AS level, f.capacity AS capacity
    `, { buildingId, floorId, level: Number(level), capacity: Number(capacity) });

    const r = result.records[0];
    res.status(201).json({
      id: toNum(r.get("id")),
      level: toNum(r.get("level")),
      capacity: toNum(r.get("capacity"))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});

module.exports = router;