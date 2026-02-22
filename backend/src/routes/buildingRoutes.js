const express = require("express");
const { driver } = require("../db");
const { toNum } = require("../utils/neo4jUtils");

const router = express.Router();

// GET /buildings - Seznam budov
router.get("/", async (req, res) => {
  const session = driver.session();
  try {
    const result = await session.run(`MATCH (b:Building) RETURN b.id AS id, b.name AS name ORDER BY id`);
    res.json(result.records.map(r => ({ id: toNum(r.get("id")), name: r.get("name") })));
  } catch (err) { res.status(500).json({ error: err.message }); }
  finally { await session.close(); }
});

// POST /buildings - Vytvoření (Unikátní ID i název)
router.post("/", async (req, res) => {
  const session = driver.session();
  const { id, name } = req.body;

  if (!id || isNaN(Number(id))) return res.status(400).json({ error: "ID budovy musí být číslo." });
  if (!name || name.trim().length < 2) return res.status(400).json({ error: "Název budovy je povinný." });

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
  } catch (err) { res.status(500).json({ error: err.message }); }
  finally { await session.close(); }
});

// DELETE /buildings/:id - Smazání budovy (včetně jejích pater)
router.delete("/:id", async (req, res) => {
  const session = driver.session();
  const id = Number(req.params.id);

  try {
    // Smažeme budovu a všechna její patra. 
    // DETACH DELETE se postará o smazání relací (HAS_FLOOR).
    const result = await session.run(`
      MATCH (b:Building {id: $id})
      OPTIONAL MATCH (b)-[:HAS_FLOOR]->(f:Floor)
      DETACH DELETE b, f
      RETURN count(b) as deletedCount
    `, { id });

    if (toNum(result.records[0].get("deletedCount")) === 0) {
      return res.status(404).json({ error: "Budova s tímto ID nebyla nalezena." });
    }

    res.json({ success: true, message: `Budova ${id} a její patra byla smazána.` });
  } catch (err) { res.status(500).json({ error: err.message }); }
  finally { await session.close(); }
});

// ... (GET /:id/floors a POST /:id/floors zůstávají stejné)
module.exports = router;