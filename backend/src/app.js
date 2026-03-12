/**
 * app.js — Express aplikace bez listen().
 * Importuji ho zvlášť, aby jej testy mohly načíst bez spuštění serveru.
 */
const express = require("express");
const cors = require("cors");
require("dotenv").config();

// Import Routes
const mapRoutes = require("./routes/mapRoutes");
const buildingRoutes = require("./routes/buildingRoutes");
const departmentRoutes = require("./routes/departmentRoutes");
const personRoutes = require("./routes/personRoutes");
const floorRoutes = require("./routes/floorRoutes");
const assignmentRoutes = require("./routes/assignmentRoutes");
const { driver } = require("./db");

const app = express();
app.use(cors());
app.use(express.json());

// Health check
app.get("/health", async (req, res) => {
  const session = driver.session();
  try {
    const result = await session.run("RETURN 1 AS ok");
    res.json({ status: "ok", db: result.records[0].get("ok").toNumber() });
  } catch (err) { res.status(500).json({ error: err.message }); }
  finally { await session.close(); }
});

// Register Domain Routes
app.use("/map", mapRoutes);
app.use("/buildings", buildingRoutes);
app.use("/departments", departmentRoutes);
app.use("/persons", personRoutes);
app.use("/floors", floorRoutes);
app.use("/assignments", assignmentRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: `Endpoint ${req.method} ${req.path} neexistuje.` });
});

// Global error handler
app.use((err, req, res, _next) => {
  console.error("[Global Error]", err);
  res.status(500).json({ error: err.message || "Interní chyba serveru." });
});

module.exports = app;
