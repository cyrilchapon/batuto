import { describe, expect, it } from "vitest";
import { contract } from "./index.js";

describe("contract.privatePing", () => {
  it("is defined as a GET /private/ping procedure", () => {
    expect(contract.privatePing["~orpc"].route?.method).toBe("GET");
    expect(contract.privatePing["~orpc"].route?.path).toBe("/private/ping");
  });
});
