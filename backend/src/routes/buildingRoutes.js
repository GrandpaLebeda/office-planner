const express = require("express");
const { driver } = require("../db");
const { toNum } = require("../utils/neo4jUtils");

const router = express.Router();

/**
 * GET /buildings
 * Seznam všech budov
 */
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

/**
 * POST /buildings
 * Vytvoření budovy s kontrolou duplicity (ID i Název)
 */
router.post("/", async (req, res) => {
  const session = driver.session();
  const { id, name } = req.body;

  if (!id || isNaN(Number(id))) return res.status(400).json({ error: "ID budovy musí být číslo." });
  if (!name || name.trim().length < 2) return res.status(400).json({ error: "Název budovy musí mít alespoň 2 znaky." });

  try {
    const check = await session.run(
      "MATCH (b:Building) WHERE b.id = $id OR b.name = $name RETURN b",
      { id: Number(id), name: name.trim() }
    );

    if (check.records.length > 0) {
      return res.status(409).json({ error: "Budova se stejným ID nebo názvem již existuje." });
    }

    const result = await session.run(`
      CREATE (b:Building {id: $id, name: $name})
      RETURN b.id AS id, b.name AS name
    `, { id: Number(id), name: name.trim() });
    
    const r = result.records[0];
    res.status(201).json({ id: toNum(r.get("id")), name: r.get("name") });
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  } finally { 
    await session.close(); 
  }
});

/**
 * DELETE /buildings/:id
 * Smazání budovy včetně všech jejích pater (DETACH DELETE)
 */
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

/**
 * GET /buildings/:id/floors
 * Seznam pater v konkrétní budově
 */
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
      // Zkontrolujeme, zda budova vůbec existuje
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

/**
 * POST /buildings/:id/floors
 * Přidání nového patra k budově (s kontrolou duplicity levelu)
 */
router.post("/:id/floors", async (req, res) => {
  const session = driver.session();
  const buildingId = Number(req.params.id);
  const { level, capacity } = req.body;

  if (isNaN(buildingId)) return res.status(400).json({ error: "ID budovy musí být číslo." });
  if (isNaN(Number(level)) || Number(level) < 0) return res.status(400).json({ error: "Level patra musí být nezáporné číslo." });
  if (isNaN(Number(capacity)) || Number(capacity) <= 0) return res.status(400).json({ error: "Kapacita musí být kladné číslo." });

  try {
    // Kontrola existence budovy a existence patra na stejném levelu
    const check = await session.run(`
      MATCH (b:Building {id: $buildingId})
      OPTIONAL MATCH (b)-[:HAS_FLOOR]->(f:Floor {level: $level})
      RETURN b, f
    `, { buildingId, level: Number(level) });

    if (check.records.length === 0) return res.status(404).json({ error: "Budova neexistuje." });
    if (check.records[0].get("f") !== null) {
      return res.status(400).json({ error: `Patro na levelu ${level} již v této budově existuje.` });
    }

    // Unikátní ID pro patro (např. 101 pro budovu 1, level 1)
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