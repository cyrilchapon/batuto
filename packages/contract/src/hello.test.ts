import { describe, expect, it } from "vitest";
import { contract } from "./index.js";

describe("contract.hello", () => {
  it("is defined as a GET /hello procedure", () => {
    expect(contract.hello["~orpc"].route?.method).toBe("GET");
    expect(contract.hello["~orpc"].route?.path).toBe("/hello");
  });
});
