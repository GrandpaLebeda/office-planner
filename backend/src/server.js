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

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
});