/**
 * cleanup.js — Pomocný modul pro smazání všech testovacích dat po skončení testů.
 * Smaže všechny uzly jejichž name začíná "Test_" prefix (bezpečné v dev/test prostředí).
 */
const request = require("supertest");
const app = require("../src/app");
const { driver } = require("../src/db");

async function cleanupTestData() {
  const session = driver.session();
  try {
    // Smaž testovací oddělení (prefixový match)
    await session.run(`
      MATCH (d:Department)
      WHERE d.name STARTS WITH 'Test_'
      DETACH DELETE d
    `);

    // Smaž testovací osoby (firstName = "Test")
    await session.run(`
      MATCH (p:Person)
      WHERE p.firstName = 'Test'
      DETACH DELETE p
    `);

    // Smaž testovací budovy
    await session.run(`
      MATCH (b:Building)
      WHERE b.name STARTS WITH 'Test_'
      OPTIONAL MATCH (b)-[:HAS_FLOOR]->(f:Floor)
      DETACH DELETE b, f
    `);
  } finally {
    await session.close();
  }
}

module.exports = { cleanupTestData, app, driver };
