const express = require("express");
const cors = require("cors");
require("dotenv").config();
const { driver } = require("./db");

// Import Routes
const mapRoutes = require("./routes/mapRoutes");
const buildingRoutes = require("./routes/buildingRoutes");
const departmentRoutes = require("./routes/departmentRoutes");
const personRoutes = require("./routes/personRoutes");
const floorRoutes = require("./routes/floorRoutes");
const assignmentRoutes = require("./routes/assignmentRoutes"); // Nový import

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
app.use("/assignments", assignmentRoutes); // Registrace nové cesty

const port = Number(process.env.PORT || 3000);
app.listen(port, () => {
  console.log(`API running on http://localhost:${port}`);
});