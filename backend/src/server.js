const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { driver } = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

app.get("/health", async (req, res) => {
  const session = driver.session();
  try {
    const result = await session.run("RETURN 1 AS ok");
    const ok = result.records[0].get("ok");
    res.json({ status: "ok", db: ok.toNumber ? ok.toNumber() : ok });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});

app.get("/map/:buildingId", async (req, res) => {
  const session = driver.session();
  const buildingId = Number(req.params.buildingId);

  const toNum = (v) => (v && typeof v.toNumber === "function" ? v.toNumber() : v);

  if (Number.isNaN(buildingId)) {
    return res.status(400).json({ error: "buildingId must be a number." });
  }

  try {
    // 1) Building (existence check)
    const buildingResult = await session.run(
      `
      MATCH (b:Building {id: $buildingId})
      RETURN b.id AS id, b.name AS name
      `,
      { buildingId }
    );

    if (buildingResult.records.length === 0) {
      return res.status(404).json({ error: "Building not found." });
    }

    const building = {
      id: toNum(buildingResult.records[0].get("id")),
      name: buildingResult.records[0].get("name"),
    };

    // 2) Najdeme poslední assignment (podle createdAt)
    const assignmentResult = await session.run(`
      MATCH (a:Assignment)
      RETURN a.id AS id, a.createdAt AS createdAt
      ORDER BY a.createdAt DESC
      LIMIT 1
    `);

    const assignmentId =
      assignmentResult.records.length > 0
        ? toNum(assignmentResult.records[0].get("id"))
        : null;

    // 3) Floors (může být prázdné)
    const floorsResult = await session.run(
      `
      MATCH (b:Building {id: $buildingId})
      OPTIONAL MATCH (b)-[:HAS_FLOOR]->(f:Floor)
      RETURN f.id AS floorId, f.level AS level, f.capacity AS capacity
      ORDER BY level
      `,
      { buildingId }
    );

    const floors = floorsResult.records
      .filter((r) => r.get("floorId") != null)
      .map((r) => ({
        id: toNum(r.get("floorId")),
        level: toNum(r.get("level")),
        capacity: toNum(r.get("capacity")),
        occupied: 0,
        departments: [],
      }));

    const floorById = new Map(floors.map((f) => [f.id, f]));

    // 4) Placementy jen pokud existuje assignment a pokud budova má patra
    if (assignmentId !== null && floors.length > 0) {
      const placementResult = await session.run(
        `
        MATCH (a:Assignment {id: $assignmentId})-[:HAS_PLACEMENT]->(pl:Placement)
        MATCH (pl)-[:OF_DEPARTMENT]->(d:Department)
        MATCH (pl)-[:ON_FLOOR]->(f:Floor)<-[:HAS_FLOOR]-(b:Building {id:$buildingId})
        OPTIONAL MATCH (d)<-[:WORKS_IN]-(p:Person)
        RETURN f.id AS floorId,
               d.id AS deptId,
               d.name AS deptName,
               count(p) AS people
        ORDER BY f.id, d.id
        `,
        { assignmentId, buildingId }
      );

      for (const r of placementResult.records) {
        const floorId = toNum(r.get("floorId"));
        const floor = floorById.get(floorId);
        if (!floor) continue;

        const people = toNum(r.get("people"));

        floor.departments.push({
          id: toNum(r.get("deptId")),
          name: r.get("deptName"),
          size: people,
        });

        floor.occupied += people;
      }
    }

    // 5) Neusazené týmy (oddělení bez placementu v posledním assignmentu)
    const unassignedResult = await session.run(
      `
      MATCH (d:Department)
      OPTIONAL MATCH (d)<-[:WORKS_IN]-(p:Person)
      WITH d, count(p) AS people
      OPTIONAL MATCH (a:Assignment)
      WITH d, people, a
      ORDER BY a.createdAt DESC
      WITH d, people, collect(a)[0] AS lastA
      OPTIONAL MATCH (lastA)-[:HAS_PLACEMENT]->(pl:Placement)-[:OF_DEPARTMENT]->(d)
      WITH d, people, pl
      WHERE pl IS NULL
      RETURN d.id AS id, d.name AS name, people AS size
      ORDER BY id
      `
    );

    const unassignedDepartments = unassignedResult.records.map((r) => ({
      id: toNum(r.get("id")),
      name: r.get("name"),
      size: toNum(r.get("size")),
    }));

    res.json({
      assignmentId,
      building,
      floors, // může být []
      unassignedDepartments,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});

app.get("/departments", async (req, res) => {
  const session = driver.session();
  try {
    const result = await session.run(`
      MATCH (d:Department)
      OPTIONAL MATCH (d)<-[:WORKS_IN]-(p:Person)
      RETURN d.id AS id,
             d.name AS name,
             count(p) AS people
      ORDER BY id
    `);

    const departments = result.records.map(r => ({
      id: r.get("id").toNumber ? r.get("id").toNumber() : r.get("id"),
      name: r.get("name"),
      people: r.get("people").toNumber ? r.get("people").toNumber() : r.get("people")
    }));

    res.json(departments);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});

app.get("/buildings", async (req, res) => {
  const session = driver.session();
  try {
    const result = await session.run(`
      MATCH (b:Building)
      RETURN b.id AS id, b.name AS name
      ORDER BY id
    `);

    const buildings = result.records.map(r => ({
      id: r.get("id").toNumber ? r.get("id").toNumber() : r.get("id"),
      name: r.get("name")
    }));

    res.json(buildings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});

app.get("/buildings/:id/floors", async (req, res) => {
  const session = driver.session();
  const buildingId = Number(req.params.id);

  // helper: převede Neo4j Integer -> number, a number nechá být
  const toNum = (v) => (v && typeof v.toNumber === "function" ? v.toNumber() : v);

  if (Number.isNaN(buildingId)) {
    return res.status(400).json({ error: "Building id must be a number." });
  }

  try {
    const result = await session.run(
      `
      MATCH (b:Building {id: $buildingId})-[:HAS_FLOOR]->(f:Floor)
      RETURN b.id AS buildingId,
             b.name AS buildingName,
             f.id AS id,
             f.level AS level,
             f.capacity AS capacity
      ORDER BY level
      `,
      { buildingId }
    );

    if (result.records.length === 0) {
      return res.status(404).json({ error: "Building not found or has no floors." });
    }

    const first = result.records[0];

    const response = {
      building: {
        id: toNum(first.get("buildingId")),
        name: first.get("buildingName"),
      },
      floors: result.records.map((r) => ({
        id: toNum(r.get("id")),
        level: toNum(r.get("level")),
        capacity: toNum(r.get("capacity")),
      })),
    };

    res.json(response);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});

app.post("/buildings/:id/floors", async (req, res) => {
  const session = driver.session();
  const toNum = (v) => (v && typeof v.toNumber === "function" ? v.toNumber() : v);

  const buildingId = Number(req.params.id);
  const level = Number(req.body.level);
  const capacity = Number(req.body.capacity);

  if ([buildingId, level, capacity].some(Number.isNaN)) {
    return res.status(400).json({ error: "buildingId, level, capacity must be numbers." });
  }
  if (level < 0 || !Number.isInteger(level)) {
    return res.status(400).json({ error: "level must be a non-negative integer." });
  }
  if (capacity <= 0 || !Number.isInteger(capacity)) {
    return res.status(400).json({ error: "capacity must be a positive integer." });
  }

  const floorId = buildingId * 100 + level;

  try {
    // ověř, že budova existuje
    const b = await session.run(
      `MATCH (b:Building {id:$buildingId}) RETURN b.id AS id`,
      { buildingId }
    );
    if (b.records.length === 0) {
      return res.status(404).json({ error: "Building not found." });
    }

    // vytvoř nebo aktualizuj patro (MERGE) + vztah
    const result = await session.run(
      `
      MATCH (b:Building {id:$buildingId})
      MERGE (f:Floor {id:$floorId})
      ON CREATE SET f.level=$level, f.capacity=$capacity
      ON MATCH SET  f.level=$level, f.capacity=$capacity
      MERGE (b)-[:HAS_FLOOR]->(f)
      RETURN f.id AS id, f.level AS level, f.capacity AS capacity
      `,
      { buildingId, floorId, level, capacity }
    );

    const r = result.records[0];
    res.status(201).json({
      id: toNum(r.get("id")),
      level: toNum(r.get("level")),
      capacity: toNum(r.get("capacity")),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});

app.put("/floors/:id", async (req, res) => {
  const session = driver.session();
  const toNum = (v) => (v && typeof v.toNumber === "function" ? v.toNumber() : v);

  const floorId = Number(req.params.id);
  const capacity = Number(req.body.capacity);

  if ([floorId, capacity].some(Number.isNaN)) {
    return res.status(400).json({ error: "floorId and capacity must be numbers." });
  }
  if (capacity <= 0 || !Number.isInteger(capacity)) {
    return res.status(400).json({ error: "capacity must be a positive integer." });
  }

  try {
    const result = await session.run(
      `
      MATCH (f:Floor {id:$floorId})
      SET f.capacity = $capacity
      RETURN f.id AS id, f.level AS level, f.capacity AS capacity
      `,
      { floorId, capacity }
    );

    if (result.records.length === 0) {
      return res.status(404).json({ error: "Floor not found." });
    }

    const r = result.records[0];
    res.json({
      id: toNum(r.get("id")),
      level: toNum(r.get("level")),
      capacity: toNum(r.get("capacity")),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});

app.delete("/floors/:id", async (req, res) => {
  const session = driver.session();

  const floorId = Number(req.params.id);
  if (Number.isNaN(floorId)) {
    return res.status(400).json({ error: "floorId must be a number." });
  }

  try {
    const result = await session.run(
      `
      MATCH (f:Floor {id:$floorId})
      WITH f
      OPTIONAL MATCH (f)<-[r]-()
      DELETE r
      WITH f
      DETACH DELETE f
      RETURN $floorId AS deletedId
      `,
      { floorId }
    );

    // Pokud Floor neexistoval, dotaz nic nesmaže – ošetříme
    if (result.records.length === 0) {
      return res.status(404).json({ error: "Floor not found." });
    }

    res.json({ deletedId: floorId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});

app.get("/persons", async (req, res) => {
  const session = driver.session();
  const toNum = (v) => (v && typeof v.toNumber === "function" ? v.toNumber() : v);

  try {
    const result = await session.run(`
      MATCH (p:Person)
      OPTIONAL MATCH (p)-[:WORKS_IN]->(d:Department)
      RETURN p.id AS id,
             p.firstName AS firstName,
             p.surname AS surname,
             d.id AS departmentId,
             d.name AS departmentName
      ORDER BY id
    `);

    const persons = result.records.map((r) => {
      const deptId = r.get("departmentId");
      return {
        id: toNum(r.get("id")),
        firstName: r.get("firstName"),
        surname: r.get("surname"),
        department: deptId == null
          ? null
          : { id: toNum(deptId), name: r.get("departmentName") },
      };
    });

    res.json(persons);
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});

app.post("/persons", async (req, res) => {
  const session = driver.session();
  const toNum = (v) => (v && typeof v.toNumber === "function" ? v.toNumber() : v);

  const personId = Number(req.body.id);
  const firstName = (req.body.firstName || "").trim();
  const surname = (req.body.surname || "").trim();
  const departmentId = Number(req.body.departmentId);

  if (Number.isNaN(personId) || Number.isNaN(departmentId)) {
    return res.status(400).json({ error: "id and departmentId must be numbers." });
  }
  if (!firstName || !surname) {
    return res.status(400).json({ error: "firstName and surname are required." });
  }

  try {
    // ověř, že department existuje
    const dep = await session.run(
      `MATCH (d:Department {id:$departmentId}) RETURN d.id AS id, d.name AS name`,
      { departmentId }
    );
    if (dep.records.length === 0) {
      return res.status(404).json({ error: "Department not found." });
    }

    // vytvoř Person (unikátní ID constraint to pohlídá)
    // nastav/aktualizuj vztah WORKS_IN (přesun mezi odděleními to taky pokryje)
    const result = await session.run(
      `
      MATCH (d:Department {id:$departmentId})
      MERGE (p:Person {id:$personId})
      SET p.firstName=$firstName, p.surname=$surname
      WITH p, d
      OPTIONAL MATCH (p)-[old:WORKS_IN]->(:Department)
      DELETE old
      MERGE (p)-[:WORKS_IN]->(d)
      RETURN p.id AS id, p.firstName AS firstName, p.surname AS surname,
             d.id AS departmentId, d.name AS departmentName
      `,
      { personId, firstName, surname, departmentId }
    );

    const r = result.records[0];
    res.status(201).json({
      id: toNum(r.get("id")),
      firstName: r.get("firstName"),
      surname: r.get("surname"),
      department: {
        id: toNum(r.get("departmentId")),
        name: r.get("departmentName"),
      },
    });
  } catch (err) {
    // unikátní constraint -> duplicate id
    if (String(err.message).toLowerCase().includes("already exists")) {
      return res.status(409).json({ error: "Person with this id already exists." });
    }
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});

app.put("/persons/:id/department", async (req, res) => {
  const session = driver.session();
  const toNum = (v) => (v && typeof v.toNumber === "function" ? v.toNumber() : v);

  const personId = Number(req.params.id);
  const departmentId = Number(req.body.departmentId);

  if (Number.isNaN(personId) || Number.isNaN(departmentId)) {
    return res.status(400).json({ error: "personId and departmentId must be numbers." });
  }

  try {
    // ověř, že osoba existuje
    const personCheck = await session.run(
      `MATCH (p:Person {id:$personId}) RETURN p.id AS id`,
      { personId }
    );

    if (personCheck.records.length === 0) {
      return res.status(404).json({ error: "Person not found." });
    }

    // ověř, že department existuje
    const departmentCheck = await session.run(
      `MATCH (d:Department {id:$departmentId}) RETURN d.id AS id`,
      { departmentId }
    );

    if (departmentCheck.records.length === 0) {
      return res.status(404).json({ error: "Department not found." });
    }

    // smaž starý WORKS_IN a vytvoř nový
    const result = await session.run(
      `
      MATCH (p:Person {id:$personId})
      MATCH (d:Department {id:$departmentId})
      OPTIONAL MATCH (p)-[r:WORKS_IN]->(:Department)
      DELETE r
      MERGE (p)-[:WORKS_IN]->(d)
      RETURN p.id AS id, p.firstName AS firstName, p.surname AS surname,
             d.id AS departmentId, d.name AS departmentName
      `,
      { personId, departmentId }
    );

    const r = result.records[0];

    res.json({
      id: toNum(r.get("id")),
      firstName: r.get("firstName"),
      surname: r.get("surname"),
      department: {
        id: toNum(r.get("departmentId")),
        name: r.get("departmentName"),
      },
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    await session.close();
  }
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
});