const express = require("express");
const { driver } = require("../db");
const { toNum } = require("../utils/neo4jUtils");

const router = express.Router();

/**
 * GET /departments
 * Seznam oddělení včetně informací o lidech a spolupracujícím oddělení
 */
router.get("/", async (req, res) => {
  const session = driver.session();
  try {
    const result = await session.run(`
      MATCH (d:Department)
      OPTIONAL MATCH (d)<-[:WORKS_IN]-(p:Person)
      OPTIONAL MATCH (d)-[:COLLABORATES_WITH]->(partner:Department)
      RETURN d.id AS id, d.name AS name, count(distinct p) AS people, 
             partner.id AS partnerId, partner.name AS partnerName
      ORDER BY id
    `);
    res.json(result.records.map(r => ({
      id: toNum(r.get("id")),
      name: r.get("name"),
      people: toNum(r.get("people")),
      collaboratesWith: r.get("partnerId") ? {
        id: toNum(r.get("partnerId")),
        name: r.get("partnerName")
      } : null
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});

/**
 * POST /departments
 * Vytvoření nového oddělení (volitelně i s partnerem)
 */
router.post("/", async (req, res) => {
  const session = driver.session();
  const { id, name, collaboratesWithId } = req.body;

  if (!id || isNaN(Number(id))) return res.status(400).json({ error: "ID oddělení musí být číslo." });
  if (!name || name.trim().length < 2) return res.status(400).json({ error: "Název je povinný (min. 2 znaky)." });

  try {
    const check = await session.run("MATCH (d:Department {id: $id}) RETURN d", { id: Number(id) });
    if (check.records.length > 0) return res.status(409).json({ error: "Oddělení s tímto ID již existuje." });

    await session.run(`CREATE (d:Department {id: $id, name: $name})`, { id: Number(id), name: name.trim() });

    if (collaboratesWithId && !isNaN(Number(collaboratesWithId))) {
      await session.run(`
        MATCH (d1:Department {id: $id})
        MATCH (d2:Department {id: $partnerId})
        MERGE (d1)-[:COLLABORATES_WITH]->(d2)
        MERGE (d2)-[:COLLABORATES_WITH]->(d1)
      `, { id: Number(id), partnerId: Number(collaboratesWithId) });
    }

    res.status(201).json({ success: true, message: "Oddělení úspěšně vytvořeno." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});

/**
 * PUT /departments/:id/collaboration
 * Dodatečné nastavení nebo změna spolupracujícího oddělení
 */
router.put("/:id/collaboration", async (req, res) => {
  const session = driver.session();
  const deptId = Number(req.params.id);
  const { collaboratesWithId } = req.body;

  if (isNaN(deptId) || isNaN(Number(collaboratesWithId))) {
    return res.status(400).json({ error: "ID oddělení i partnera musí být čísla." });
  }

  try {
    await session.run(`
      MATCH (d1:Department {id: $deptId})
      MATCH (d2:Department {id: $partnerId})
      OPTIONAL MATCH (d1)-[r:COLLABORATES_WITH]-(:Department)
      DELETE r
      WITH d1, d2
      MERGE (d1)-[:COLLABORATES_WITH]->(d2)
      MERGE (d2)-[:COLLABORATES_WITH]->(d1)
    `, { deptId, partnerId: Number(collaboratesWithId) });

    res.json({ success: true, message: "Vztah spolupráce byl aktualizován." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});

/**
 * DELETE /departments/:id
 * Smazání oddělení a všech jeho vazeb (DETACH DELETE)
 */
router.delete("/:id", async (req, res) => {
  const session = driver.session();
  const id = Number(req.params.id);

  if (isNaN(id)) return res.status(400).json({ error: "ID oddělení musí být číslo." });

  try {
    const result = await session.run(`
      MATCH (d:Department {id: $id})
      DETACH DELETE d
      RETURN count(d) AS deletedCount
    `, { id });

    if (toNum(result.records[0].get("deletedCount")) === 0) {
      return res.status(404).json({ error: "Oddělení nebylo nalezeno." });
    }

    res.json({ success: true, message: `Oddělení s ID ${id} bylo smazáno.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});

module.exports = router;