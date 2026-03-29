const request = require("supertest");
const { cleanupTestData, app, driver } = require("./testHelpers");

const uname = () => `Test_Budova_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

beforeAll(async () => {
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await driver.close();
});

describe("Buildings API", () => {
  test("GET /buildings — vrátí pole budov", async () => {
    const res = await request(app).get("/buildings");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test("POST /buildings — vytvoří novou budovu", async () => {
    const name = uname();
    const res = await request(app).post("/buildings").send({ name });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe(name);
    expect(res.body.id).toBeDefined();
  });

  test("POST /buildings — příliš krátký název → 400", async () => {
    const res = await request(app).post("/buildings").send({ name: "A" });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeDefined();
  });

  test("POST /buildings — duplicitní název → 409", async () => {
    const name = uname();
    await request(app).post("/buildings").send({ name });
    const res = await request(app).post("/buildings").send({ name });
    expect(res.status).toBe(409);
  });

  test("PUT /buildings/:id — přejmenuje budovu", async () => {
    const name = uname();
    const create = await request(app).post("/buildings").send({ name });
    const id = create.body.id;
    const newName = uname() + "_renamed";
    const res = await request(app).put(`/buildings/${id}`).send({ name: newName });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe(newName);
  });

  test("PUT /buildings/:id — neexistující ID → 404", async () => {
    const res = await request(app).put("/buildings/999999").send({ name: "Neco_validni" });
    expect(res.status).toBe(404);
  });

  test("DELETE /buildings/:id — smaže budovu", async () => {
    const name = uname();
    const create = await request(app).post("/buildings").send({ name });
    const id = create.body.id;
    const res = await request(app).delete(`/buildings/${id}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test("DELETE /buildings/:id — neexistující ID → 404", async () => {
    const res = await request(app).delete("/buildings/999999");
    expect(res.status).toBe(404);
  });

  test("POST /buildings/:id/floors — přidá patro", async () => {
    const name = uname();
    const create = await request(app).post("/buildings").send({ name });
    const bId = create.body.id;
    const res = await request(app).post(`/buildings/${bId}/floors`).send({ level: 1, capacity: 20 });
    expect(res.status).toBe(201);
    expect(res.body.level).toBe(1);
    expect(res.body.capacity).toBe(20);
  });

  test("POST /buildings/:id/floors — duplicitní level → 400", async () => {
    const name = uname();
    const create = await request(app).post("/buildings").send({ name });
    const bId = create.body.id;
    await request(app).post(`/buildings/${bId}/floors`).send({ level: 1, capacity: 20 });
    const res = await request(app).post(`/buildings/${bId}/floors`).send({ level: 1, capacity: 30 });
    expect(res.status).toBe(400);
  });
});
