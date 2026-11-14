import * as S from "sury-11";
import { describe, expect, it, vi } from "vitest";

import { coldToJsonSchema } from "./cold.js";

// `sury` 10 is the one installed as `sury`, so the handler is given 11.x.
vi.mock("sury", () => import("sury-11"));

// A global switch, which is why these tests have a file of their own.
S.enableStandardJSONSchema();

describe("sury 11 with S.enableStandardJSONSchema()", () => {
  const schema = S.schema({ quantity: S.string.with(S.to, S.number) });

  it.each([
    ["without a target", {}, "https://json-schema.org/draft/2020-12/schema"],
    [
      "for the draft-07 target",
      { target: "draft-07" },
      "http://json-schema.org/draft-07/schema#",
    ],
  ])(
    "converts a schema through its own converter %s, before the handler is loaded",
    async (_, options, $schema) => {
      const toJsonSchema = await coldToJsonSchema();
      const jsonSchema = {
        $schema,
        properties: { quantity: { type: "string" } },
        required: ["quantity"],
        type: "object",
      };

      expect(toJsonSchema.sync(schema, options)).toEqual(jsonSchema);
      expect(await toJsonSchema(schema, options)).toEqual(jsonSchema);
    },
  );

  it("converts the output through its own converter", async () => {
    const toJsonSchema = await coldToJsonSchema();

    expect(toJsonSchema.sync(schema, { io: "output" })).toMatchObject({
      properties: { quantity: { type: "number" } },
    });
  });
});
