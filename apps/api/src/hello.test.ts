import { db } from "@batuto/db";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import { createApp } from "./app.js";

const app = createApp();

describe("GET /hello", () => {
  afterAll(async () => {
    await db.helloWorld.deleteMany();
    await db.$disconnect();
  });

  it("round-trips through the db and returns a greeting", async () => {
    const response = await request(app).get("/hello").query({ name: "Batuto" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: "Hello, Batuto!" });

    const rows = await db.helloWorld.findMany();
    expect(rows).toHaveLength(1);
  });
});
