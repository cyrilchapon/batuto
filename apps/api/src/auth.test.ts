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
