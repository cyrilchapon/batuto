import { describe, expect, it } from "vitest";
import { helloWorldDto } from "./hello.js";

describe("helloWorldDto", () => {
  it("accepts a valid payload", () => {
    expect(helloWorldDto.parse({ message: "hello" })).toEqual({ message: "hello" });
  });

  it("rejects a payload missing message", () => {
    expect(() => helloWorldDto.parse({})).toThrow();
  });
});
