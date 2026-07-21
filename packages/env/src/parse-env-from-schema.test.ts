import { describe, expect, it } from "vitest";
import { z } from "zod";
import { parseEnvFromSchema } from "./parse-env-from-schema.js";

describe("parseEnvFromSchema", () => {
  const schema = z.object({
    FOO: z.string(),
    PORT: z.coerce.number().default(3000),
  });
  const parse = parseEnvFromSchema(schema);

  it("parses and types a valid raw env", () => {
    expect(parse({ FOO: "bar", PORT: "4000" })).toEqual({ FOO: "bar", PORT: 4000 });
  });

  it("applies schema defaults for missing keys", () => {
    expect(parse({ FOO: "bar" })).toEqual({ FOO: "bar", PORT: 3000 });
  });

  it("throws when a required key is missing", () => {
    expect(() => parse({})).toThrow();
  });
});
