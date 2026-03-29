const request = require("supertest");
const { cleanupTestData, app, driver } = require("./testHelpers");

beforeAll(async () => {
  await cleanupTestData();
});

afterAll(async () => {
  await cleanupTestData();
  await driver.close();
});

describe("Persons API", () => {
  test("GET /persons — vrátí pole zaměstnanců", async () => {
    const res = await request(app).get("/persons");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test("POST /persons — vytvoří zaměstnance bez oddělení", async () => {
    const res = await request(app).post("/persons").send({
      firstName: "Test",
      surname: `Uzivatel_${Date.now()}`,
    });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.department).toBeNull();
  });

  test("POST /persons — chybí jméno → 400", async () => {
    const res = await request(app).post("/persons").send({ surname: "Prijmeni" });
    expect(res.status).toBe(400);
  });

  test("POST /persons — příliš krátké příjmení → 400", async () => {
    const res = await request(app).post("/persons").send({ firstName: "Test", surname: "X" });
    expect(res.status).toBe(400);
  });

  test("PUT /persons/:id/department — přiřadí zaměstnance do oddělení", async () => {
    const person = await request(app).post("/persons").send({
      firstName: "Test",
      surname: `Assign_${Date.now()}`,
    });
    const dept = await request(app).post("/departments").send({ name: `Test_Dept_PA_${Date.now()}` });

    const res = await request(app)
      .put(`/persons/${person.body.id}/department`)
      .send({ departmentId: dept.body.id });
    expect(res.status).toBe(200);
    expect(res.body.department?.id).toBe(dept.body.id);
  });

  test("PUT /persons/:id/department — double-assign do jiného oddělení → 409", async () => {
    const person = await request(app).post("/persons").send({
      firstName: "Test",
      surname: `DoubleAssign_${Date.now()}`,
    });
    const deptA = await request(app).post("/departments").send({ name: `Test_Dept_DA_${Date.now()}` });
    const deptB = await request(app).post("/departments").send({ name: `Test_Dept_DB_${Date.now()}` });

    await request(app).put(`/persons/${person.body.id}/department`).send({ departmentId: deptA.body.id });
    const res = await request(app).put(`/persons/${person.body.id}/department`).send({ departmentId: deptB.body.id });
    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/již zařazen/);
  });

  test("PUT /persons/:id/department s null — odebere z oddělení", async () => {
    const person = await request(app).post("/persons").send({
      firstName: "Test",
      surname: `Unassign_${Date.now()}`,
    });
    const dept = await request(app).post("/departments").send({ name: `Test_Dept_UN_${Date.now()}` });
    await request(app).put(`/persons/${person.body.id}/department`).send({ departmentId: dept.body.id });

    const res = await request(app).put(`/persons/${person.body.id}/department`).send({ departmentId: null });
    expect(res.status).toBe(200);
    expect(res.body.department).toBeNull();
  });

  test("DELETE /persons/:id — smaže zaměstnance", async () => {
    const person = await request(app).post("/persons").send({
      firstName: "Test",
      surname: `Delete_${Date.now()}`,
    });
    const res = await request(app).delete(`/persons/${person.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  test("DELETE /persons/:id — neexistující → 404", async () => {
    const res = await request(app).delete("/persons/999999");
    expect(res.status).toBe(404);
  });
});
