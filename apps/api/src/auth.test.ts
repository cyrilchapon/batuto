import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";

const app = createApp();

describe("GET /private/ping", () => {
  it("blocks a request with no session token", async () => {
    const response = await request(app).get("/private/ping");

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("POST /private/hello", () => {
  it("blocks a request with no session token", async () => {
    const response = await request(app).post("/private/hello").send({ name: "Batuto" });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ code: "UNAUTHORIZED" });
  });
});

describe("POST /private/boom", () => {
  it("blocks a request with no session token", async () => {
    const response = await request(app).post("/private/boom").send({});

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ code: "UNAUTHORIZED" });
  });
});
