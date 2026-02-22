const express = require("express");
const { driver } = require("../db");
const { toNum } = require("../utils/neo4jUtils");

const router = express.Router();

// PUT /floors/:id - Update floor capacity
router.put("/:id", async (req, res) => {
  const session = driver.session();
  const floorId = Number(req.params.id);
  const capacity = Number(req.body.capacity);

  if ([floorId, capacity].some(Number.isNaN)) {
    return res.status(400).json({ error: "floorId and capacity must be numbers." });
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

// DELETE /floors/:id - Delete a floor and its relationships
router.delete("/:id", async (req, res) => {
  const session = driver.session();
  const floorId = Number(req.params.id);

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

module.exports = router;