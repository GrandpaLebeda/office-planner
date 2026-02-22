const express = require("express");
const { driver } = require("../db");
const { toNum } = require("../utils/neo4jUtils");

const router = express.Router();

/**
 * GET /persons
 * Seznam všech zaměstnanců a jejich aktuálních oddělení
 */
router.get("/", async (req, res) => {
  const session = driver.session();
  try {
    const result = await session.run(`
      MATCH (p:Person)
      OPTIONAL MATCH (p)-[:WORKS_IN]->(d:Department)
      RETURN p.id AS id, p.firstName AS firstName, p.surname AS surname, 
             d.id AS departmentId, d.name AS departmentName
      ORDER BY id
    `);
    res.json(result.records.map(r => ({
      id: toNum(r.get("id")),
      firstName: r.get("firstName"),
      surname: r.get("surname"),
      department: r.get("departmentId") ? { 
        id: toNum(r.get("departmentId")), 
        name: r.get("departmentName") 
      } : null
    })));
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});

/**
 * POST /persons
 * Vytvoření nové osoby (Unikátní ID, jména se mohou opakovat)
 */
router.post("/", async (req, res) => {
  const session = driver.session();
  const { id, firstName, surname, departmentId } = req.body;

  if (!id || isNaN(Number(id))) return res.status(400).json({ error: "ID osoby musí být číslo." });
  if (!firstName || firstName.trim().length < 2) return res.status(400).json({ error: "Jméno je povinné." });
  if (!surname || surname.trim().length < 2) return res.status(400).json({ error: "Příjmení je povinné." });
  if (!departmentId || isNaN(Number(departmentId))) return res.status(400).json({ error: "ID oddělení musí být číslo." });

  try {
    const checkPerson = await session.run("MATCH (p:Person {id: $id}) RETURN p", { id: Number(id) });
    if (checkPerson.records.length > 0) {
      return res.status(409).json({ error: "Osoba s tímto ID již existuje." });
    }

    const checkDept = await session.run("MATCH (d:Department {id: $departmentId}) RETURN d", { departmentId: Number(departmentId) });
    if (checkDept.records.length === 0) {
      return res.status(404).json({ error: "Cílové oddělení neexistuje." });
    }

    const result = await session.run(`
      MATCH (d:Department {id: $departmentId})
      CREATE (p:Person {id: $personId, firstName: $firstName, surname: $surname})
      CREATE (p)-[:WORKS_IN]->(d)
      RETURN p.id AS id, p.firstName AS firstName, p.surname AS surname, 
             d.id AS departmentId, d.name AS departmentName
    `, { 
      personId: Number(id), 
      firstName: firstName.trim(), 
      surname: surname.trim(), 
      departmentId: Number(departmentId) 
    });

    const r = result.records[0];
    res.status(201).json({ 
      id: toNum(r.get("id")), 
      firstName: r.get("firstName"), 
      surname: r.get("surname"), 
      department: { id: toNum(r.get("departmentId")), name: r.get("departmentName") } 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});

/**
 * PUT /persons/:id/department
 * Přeřazení osoby do jiného oddělení
 */
router.put("/:id/department", async (req, res) => {
  const session = driver.session();
  const personId = Number(req.params.id);
  const { departmentId } = req.body;

  if (isNaN(personId) || isNaN(Number(departmentId))) {
    return res.status(400).json({ error: "personId a departmentId musí být čísla." });
  }

  try {
    const result = await session.run(`
      MATCH (p:Person {id: $personId})
      MATCH (d:Department {id: $departmentId})
      OPTIONAL MATCH (p)-[oldRel:WORKS_IN]->(:Department)
      DELETE oldRel
      CREATE (p)-[:WORKS_IN]->(d)
      RETURN p.id AS id, p.firstName AS firstName, p.surname AS surname, 
             d.id AS deptId, d.name AS deptName
    `, { personId, departmentId: Number(departmentId) });

    if (result.records.length === 0) {
      return res.status(404).json({ error: "Osoba nebo cílové oddělení nebylo nalezeno." });
    }

    const r = result.records[0];
    res.json({ 
      id: toNum(r.get("id")), 
      firstName: r.get("firstName"), 
      surname: r.get("surname"), 
      department: { id: toNum(r.get("deptId")), name: r.get("deptName") } 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});

/**
 * DELETE /persons/:id
 * Smazání osoby z databáze
 */
router.delete("/:id", async (req, res) => {
  const session = driver.session();
  const personId = Number(req.params.id);

  if (isNaN(personId)) return res.status(400).json({ error: "ID osoby musí být číslo." });

  try {
    const result = await session.run(`
      MATCH (p:Person {id: $personId})
      DETACH DELETE p
      RETURN count(p) AS deletedCount
    `, { personId });

    if (toNum(result.records[0].get("deletedCount")) === 0) {
      return res.status(404).json({ error: "Osoba s tímto ID nebyla nalezena." });
    }

    res.json({ success: true, message: `Osoba s ID ${personId} byla smazána.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});

module.exports = router;