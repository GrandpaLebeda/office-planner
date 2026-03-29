const request = require("supertest");
const { cleanupTestData, app, driver } = require("./testHelpers");

beforeAll(async () => {
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await driver.close();
});

describe("GET /health", () => {
  test("vrátí status ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});

describe("404 handler", () => {
  test("neznámý endpoint vrátí 404", async () => {
    const res = await request(app).get("/neexistuje");
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/neexistuje/);
  });
});
