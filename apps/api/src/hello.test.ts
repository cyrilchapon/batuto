import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app.js";

const app = createApp();

describe("GET /hello", () => {
  it("returns a greeting", async () => {
    const response = await request(app).get("/hello").query({ name: "Batuto" });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: "Hello, Batuto!" });
  });
});
