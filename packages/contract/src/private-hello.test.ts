import { describe, expect, it } from "vitest";
import { contract } from "./index.js";

describe("contract.privateHello", () => {
  it("is defined as a POST /private/hello procedure", () => {
    expect(contract.privateHello["~orpc"].route?.method).toBe("POST");
    expect(contract.privateHello["~orpc"].route?.path).toBe("/private/hello");
  });
});
