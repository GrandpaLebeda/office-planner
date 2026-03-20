const request = require("supertest");
const app = require("../src/app");
const { driver } = require("../src/db");

async function cleanupTestData() {
  const session = driver.session();
  try {
    // smazani testovacich oddeleni
    await session.run(`
      MATCH (d:Department)
      WHERE d.name STARTS WITH 'Test_'
      DETACH DELETE d
    `);

    // smazani testovaci osoby
    await session.run(`
      MATCH (p:Person)
      WHERE p.firstName = 'Test'
      DETACH DELETE p
    `);

    // Smazani testovaci budovy
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
