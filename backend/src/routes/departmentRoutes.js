const express = require("express");
const { driver } = require("../db");
const { toNum } = require("../utils/neo4jUtils");

const router = express.Router();

// GET /departments
router.get("/", async (req, res) => {
  const session = driver.session();
  try {
    const result = await session.run(`
      MATCH (d:Department)
      OPTIONAL MATCH (d)<-[:WORKS_IN]-(p:Person)
      RETURN d.id AS id, d.name AS name, count(p) AS people
      ORDER BY id
    `);
    res.json(result.records.map(r => ({
      id: toNum(r.get("id")),
      name: r.get("name"),
      people: toNum(r.get("people"))
    })));
  } catch (err) { res.status(500).json({ error: err.message }); }
  finally { await session.close(); }
});

// POST /departments - Vytvoření (s kontrolou duplicity ID/názvu)
router.post("/", async (req, res) => {
  const session = driver.session();
  const { id, name } = req.body;

  if (!id || isNaN(Number(id))) return res.status(400).json({ error: "ID oddělení musí být číslo." });
  if (!name || name.trim().length < 2) return res.status(400).json({ error: "Název oddělení je povinný." });

  try {
    const check = await session.run(
      "MATCH (d:Department) WHERE d.id = $id OR d.name = $name RETURN d",
      { id: Number(id), name: name.trim() }
    );

    if (check.records.length > 0) {
      return res.status(409).json({ error: "Oddělení se stejným ID nebo názvem již existuje." });
    }

    const result = await session.run(`
      CREATE (d:Department {id: $id, name: $name})
      RETURN d.id AS id, d.name AS name
    `, { id: Number(id), name: name.trim() });

    const r = result.records[0];
    res.status(201).json({ id: toNum(r.get("id")), name: r.get("name") });
  } catch (err) { res.status(500).json({ error: err.message }); }
  finally { await session.close(); }
});

module.exports = router;