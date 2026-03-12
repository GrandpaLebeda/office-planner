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
    // 1) Find the latest assignment first to know where departments are placed
    const aRes = await session.run(`MATCH (a:Assignment) RETURN a.id AS id ORDER BY a.createdAt DESC LIMIT 1`);
    const latestAssignmentId = aRes.records.length > 0 ? toNum(aRes.records[0].get("id")) : null;

    let result;
    if (latestAssignmentId !== null) {
      result = await session.run(`
        MATCH (p:Person)
        OPTIONAL MATCH (p)-[:WORKS_IN]->(d:Department)
        OPTIONAL MATCH (a:Assignment {id: $assignmentId})-[:HAS_PLACEMENT]->(pl:Placement)-[:OF_DEPARTMENT]->(d)
        OPTIONAL MATCH (pl)-[:ON_FLOOR]->(f:Floor)<-[:HAS_FLOOR]-(b:Building)
        RETURN p.id AS id, p.firstName AS firstName, p.surname AS surname, 
               d.id AS departmentId, d.name AS departmentName,
               b.id AS buildingId, b.name AS buildingName,
               f.id AS floorId, f.level AS floorLevel
        ORDER BY id
      `, { assignmentId: latestAssignmentId });
    } else {
      result = await session.run(`
        MATCH (p:Person)
        OPTIONAL MATCH (p)-[:WORKS_IN]->(d:Department)
        RETURN p.id AS id, p.firstName AS firstName, p.surname AS surname, 
               d.id AS departmentId, d.name AS departmentName,
               null AS buildingId, null AS buildingName,
               null AS floorId, null AS floorLevel
        ORDER BY id
      `);
    }

    res.json(result.records.map(r => ({
      id: toNum(r.get("id")),
      firstName: r.get("firstName"),
      surname: r.get("surname"),
      department: r.get("departmentId") ? { 
        id: toNum(r.get("departmentId")), 
        name: r.get("departmentName") 
      } : null,
      building: r.get("buildingId") ? {
        id: toNum(r.get("buildingId")),
        name: r.get("buildingName")
      } : null,
      floor: r.get("floorId") ? {
        id: toNum(r.get("floorId")),
        level: toNum(r.get("floorLevel"))
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
 * Vytvoření nové osoby (s autoincrement ID, oddělení je nepovinné)
 */
router.post("/", async (req, res) => {
  const session = driver.session();
  const { firstName, surname, departmentId } = req.body;

  if (!firstName || firstName.trim().length < 2) return res.status(400).json({ error: "Jméno je povinné." });
  if (!surname || surname.trim().length < 2) return res.status(400).json({ error: "Příjmení je povinné." });

  try {
    // Auto-increment logic pro ID zaměstnance
    const idResult = await session.run(`
      MATCH (p:Person) 
      RETURN coalesce(max(p.id), 0) + 1 AS nextId
    `);
    const nextId = toNum(idResult.records[0].get("nextId"));

    if (departmentId && !isNaN(Number(departmentId))) {
      const checkDept = await session.run("MATCH (d:Department {id: $departmentId}) RETURN d", { departmentId: Number(departmentId) });
      if (checkDept.records.length === 0) {
        return res.status(404).json({ error: "Cílové oddělení neexistuje." });
      }

      // Vytvoření s vazbou na oddělení
      const result = await session.run(`
        MATCH (d:Department {id: $departmentId})
        CREATE (p:Person {id: $personId, firstName: $firstName, surname: $surname})
        CREATE (p)-[:WORKS_IN]->(d)
        RETURN p.id AS id, p.firstName AS firstName, p.surname AS surname, 
               d.id AS departmentId, d.name AS departmentName
      `, { 
        personId: nextId, 
        firstName: firstName.trim(), 
        surname: surname.trim(), 
        departmentId: Number(departmentId) 
      });

      const r = result.records[0];
      return res.status(201).json({ 
        id: toNum(r.get("id")), 
        firstName: r.get("firstName"), 
        surname: r.get("surname"), 
        department: { id: toNum(r.get("departmentId")), name: r.get("departmentName") } 
      });
    } else {
      // Vytvoření nezařazeného zaměstnance
      const result = await session.run(`
        CREATE (p:Person {id: $personId, firstName: $firstName, surname: $surname})
        RETURN p.id AS id, p.firstName AS firstName, p.surname AS surname
      `, { 
        personId: nextId, 
        firstName: firstName.trim(), 
        surname: surname.trim()
      });

      const r = result.records[0];
      return res.status(201).json({ 
        id: toNum(r.get("id")), 
        firstName: r.get("firstName"), 
        surname: r.get("surname"), 
        department: null 
      });
    }

  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});

/**
 * PUT /persons/:id/department
 * Přeřazení osoby do jiného oddělení (pokud je departmentId null, osoba je z oddělení odebrána)
 */
router.put("/:id/department", async (req, res) => {
  const session = driver.session();
  const personId = Number(req.params.id);
  const { departmentId } = req.body;

  if (isNaN(personId)) {
    return res.status(400).json({ error: "personId musí být číslo." });
  }

  try {
    if (departmentId === null) {
      // Vyřazení z oddělení
      const result = await session.run(`
        MATCH (p:Person {id: $personId})
        OPTIONAL MATCH (p)-[oldRel:WORKS_IN]->(:Department)
        DELETE oldRel
        RETURN p.id AS id, p.firstName AS firstName, p.surname AS surname
      `, { personId });

      if (result.records.length === 0) {
        return res.status(404).json({ error: "Osoba nenalezena." });
      }

      const r = result.records[0];
      return res.json({ 
        id: toNum(r.get("id")), 
        firstName: r.get("firstName"), 
        surname: r.get("surname"), 
        department: null 
      });
    } else {
      // Přiřazení do oddělení s kontrolou duplicity členství
      if (isNaN(Number(departmentId))) {
        return res.status(400).json({ error: "departmentId musí být číslo nebo null." });
      }

      // Check if person is already in a department
      const checkRel = await session.run(`
        MATCH (p:Person {id: $personId})-[:WORKS_IN]->(existing:Department)
        RETURN existing.id AS existingId, existing.name AS existingName
      `, { personId });

      if (checkRel.records.length > 0) {
        const existingId = toNum(checkRel.records[0].get("existingId"));
        const existingName = checkRel.records[0].get("existingName");
        if (existingId !== Number(departmentId)) {
          return res.status(409).json({ 
            error: `Zaměstnanec je již zařazen v oddělení "${existingName}". Nejdříve jej z původního týmu odeberte.` 
          });
        } else {
          // If trying to add to the same department, just return success
          return res.json({ message: "Zaměstnanec je již členem tohoto týmu." });
        }
      }

      const result = await session.run(`
        MATCH (p:Person {id: $personId})
        MATCH (d:Department {id: $departmentId})
        CREATE (p)-[:WORKS_IN]->(d)
        RETURN p.id AS id, p.firstName AS firstName, p.surname AS surname, 
               d.id AS deptId, d.name AS deptName
      `, { personId, departmentId: Number(departmentId) });

      if (result.records.length === 0) {
        return res.status(404).json({ error: "Osoba nebo cílové oddělení nebylo nalezeno." });
      }

      const r = result.records[0];
      return res.json({ 
        id: toNum(r.get("id")), 
        firstName: r.get("firstName"), 
        surname: r.get("surname"), 
        department: { id: toNum(r.get("deptId")), name: r.get("deptName") } 
      });
    }
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