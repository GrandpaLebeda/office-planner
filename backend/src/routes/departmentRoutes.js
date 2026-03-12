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
 * Vytvoření nového oddělení (volitelně i s partnerem, ID generováno auto-inkrementálně)
 */
router.post("/", async (req, res) => {
  const session = driver.session();
  const { name, collaboratesWithId } = req.body;

  if (!name || name.trim().length < 2) return res.status(400).json({ error: "Název je povinný (min. 2 znaky)." });

  try {
    const check = await session.run("MATCH (d:Department {name: $name}) RETURN d", { name: name.trim() });
    if (check.records.length > 0) return res.status(409).json({ error: "Oddělení s tímto názvem již existuje." });

    // Auto-increment logic pro ID oddělení
    const idResult = await session.run(`
      MATCH (d:Department) 
      RETURN coalesce(max(d.id), 0) + 1 AS nextId
    `);
    const nextId = toNum(idResult.records[0].get("nextId"));

    const result = await session.run(`
      CREATE (d:Department {id: $id, name: $name})
      RETURN d.id AS id, d.name AS name
    `, { id: nextId, name: name.trim() });

    if (collaboratesWithId && !isNaN(Number(collaboratesWithId))) {
      await session.run(`
        MATCH (d1:Department {id: $id})
        MATCH (d2:Department {id: $partnerId})
        MERGE (d1)-[:COLLABORATES_WITH]->(d2)
        MERGE (d2)-[:COLLABORATES_WITH]->(d1)
      `, { id: nextId, partnerId: Number(collaboratesWithId) });
    }

    const created = result.records[0];
    res.status(201).json({ 
      id: toNum(created.get("id")), 
      name: created.get("name"), 
      message: "Oddělení úspěšně vytvořeno." 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});

/**
 * PUT /departments/:id/collaboration
 * Nastavení nebo odebrání spolupracujícího oddělení.
 * Posláním collaboratesWithId: null se odebere veškerá spolupráce.
 */
router.put("/:id/collaboration", async (req, res) => {
  const session = driver.session();
  const deptId = Number(req.params.id);
  const { collaboratesWithId } = req.body;

  if (isNaN(deptId)) {
    return res.status(400).json({ error: "ID oddělení musí být číslo." });
  }

  try {
    if (collaboratesWithId === null || collaboratesWithId === undefined || collaboratesWithId === "") {
      // Odebrání veškeré spolupráce — smažeme všechny COLLABORATES_WITH hrany obousměrně
      await session.run(`
        MATCH (d:Department {id: $deptId})
        OPTIONAL MATCH (d)-[r1:COLLABORATES_WITH]->(other:Department)
        OPTIONAL MATCH (other)-[r2:COLLABORATES_WITH]->(d)
        DELETE r1, r2
      `, { deptId });
      return res.json({ success: true, message: "Spolupráce byla odebrána." });
    }

    // Nastavení nového partnera
    const partnerId = Number(collaboratesWithId);
    if (isNaN(partnerId)) {
      return res.status(400).json({ error: "ID partnera musí být číslo." });
    }

    await session.run(`
      MATCH (d1:Department {id: $deptId})
      MATCH (d2:Department {id: $partnerId})
      OPTIONAL MATCH (d1)-[r1:COLLABORATES_WITH]->()
      OPTIONAL MATCH ()-[r2:COLLABORATES_WITH]->(d1)
      DELETE r1, r2
      WITH d1, d2
      MERGE (d1)-[:COLLABORATES_WITH]->(d2)
      MERGE (d2)-[:COLLABORATES_WITH]->(d1)
    `, { deptId, partnerId });

    res.json({ success: true, message: "Vztah spolupráce byl aktualizován." });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});

/**
 * PUT /departments/:id
 * Úprava názvu oddělení
 */
router.put("/:id", async (req, res) => {
  const session = driver.session();
  const id = Number(req.params.id);
  const { name } = req.body;

  if (isNaN(id)) return res.status(400).json({ error: "ID oddělení musí být číslo." });
  if (!name || name.trim().length < 2) return res.status(400).json({ error: "Název oddělení musí mít alespoň 2 znaky." });

  try {
    const checkDuplicate = await session.run(
      "MATCH (d:Department) WHERE d.name = $name AND d.id <> $id RETURN d",
      { id, name: name.trim() }
    );

    if (checkDuplicate.records.length > 0) {
      return res.status(409).json({ error: "Oddělení se stejným názvem již existuje." });
    }

    const result = await session.run(`
      MATCH (d:Department {id: $id})
      SET d.name = $name
      RETURN d.id AS id, d.name AS name
    `, { id, name: name.trim() });

    if (result.records.length === 0) {
      return res.status(404).json({ error: "Oddělení s tímto ID nebylo nalezeno." });
    }
    
    const r = result.records[0];
    res.json({ id: toNum(r.get("id")), name: r.get("name") });
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
    // Nejdříve smaž Placement uzly odkazující na toto oddělení (osiřelé záznamy)
    await session.run(`
      MATCH (pl:Placement)-[:OF_DEPARTMENT]->(d:Department {id: $id})
      DETACH DELETE pl
    `, { id });

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