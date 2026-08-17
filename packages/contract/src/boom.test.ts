import { describe, expect, it } from "vitest";
import { contract } from "./index.js";

describe("contract.boom", () => {
  it("is defined as a POST /private/boom procedure", () => {
    expect(contract.boom["~orpc"].route?.method).toBe("POST");
    expect(contract.boom["~orpc"].route?.path).toBe("/private/boom");
  });
});
