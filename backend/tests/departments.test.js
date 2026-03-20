const request = require("supertest");
const { cleanupTestData, app, driver } = require("./testHelpers");

const uname = () => `Test_Dept_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

beforeAll(async () => {
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await driver.close();
});

describe("Departments API", () => {
  test("GET /departments — vrátí pole oddělení", async () => {
    const res = await request(app).get("/departments");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test("POST /departments — vytvoří nové oddělení", async () => {
    const name = uname();
    const res = await request(app).post("/departments").send({ name });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe(name);
  });

  test("POST /departments — krátký název → 400", async () => {
    const res = await request(app).post("/departments").send({ name: "X" });
    expect(res.status).toBe(400);
  });

  test("POST /departments — duplicitní název → 409", async () => {
    const name = uname();
    await request(app).post("/departments").send({ name }); // první projde
    const res = await request(app).post("/departments").send({ name }); // druhý → 409
    expect(res.status).toBe(409);
  });

  test("PUT /departments/:id — přejmenuje oddělení", async () => {
    const name = uname();
    const create = await request(app).post("/departments").send({ name });
    const id = create.body.id;
    const newName = uname() + "_renamed";
    const res = await request(app).put(`/departments/${id}`).send({ name: newName });
    expect(res.status).toBe(200);
    expect(res.body.name).toBe(newName);
  });

  test("PUT /departments/:id/collaboration — nastaví spolupráci", async () => {
    const nameA = uname();
    const nameB = uname();
    const a = await request(app).post("/departments").send({ name: nameA });
    const b = await request(app).post("/departments").send({ name: nameB });
    const res = await request(app)
      .put(`/departments/${a.body.id}/collaboration`)
      .send({ collaboratesWithId: b.body.id });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test("PUT /departments/:id/collaboration s null — odebere spolupráci", async () => {
    const nameA = uname();
    const nameB = uname();
    const a = await request(app).post("/departments").send({ name: nameA });
    const b = await request(app).post("/departments").send({ name: nameB });
    await request(app).put(`/departments/${a.body.id}/collaboration`).send({ collaboratesWithId: b.body.id });
    const res = await request(app)
      .put(`/departments/${a.body.id}/collaboration`)
      .send({ collaboratesWithId: null });
    expect(res.status).toBe(200);
    const check = await request(app).get("/departments");
    const dept = check.body.find(d => d.id === a.body.id);
    expect(dept?.collaboratesWith).toBeNull();
  });

  test("DELETE /departments/:id — smaže oddělení", async () => {
    const name = uname();
    const create = await request(app).post("/departments").send({ name });
    const res = await request(app).delete(`/departments/${create.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test("DELETE /departments/:id — neexistující → 404", async () => {
    const res = await request(app).delete("/departments/999999");
    expect(res.status).toBe(404);
  });
});
