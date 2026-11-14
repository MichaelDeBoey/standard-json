import { type } from "arktype-2.2";
import { describe, expect, it } from "vitest";

import { coldToJsonSchema } from "./cold.js";

const schema = type({ name: "string", "quantity?": "number" });

const properties = {
  name: { type: "string" },
  quantity: { type: "number" },
};

describe("arktype 2.2", () => {
  it("converts a schema through its own converter, before the handler is loaded", async () => {
    const toJsonSchema = await coldToJsonSchema();
    const jsonSchema = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      properties,
      required: ["name"],
      type: "object",
    };

    expect(toJsonSchema.sync(schema)).toEqual(jsonSchema);
    expect(await toJsonSchema(schema)).toEqual(jsonSchema);
  });

  it("falls back to the handler for a target its converter doesn't support", async () => {
    const toJsonSchema = await coldToJsonSchema();
    const options = { target: "openapi-3.0" };

    // Only the async entry can load the handler to fall back to.
    expect(() => toJsonSchema.sync(schema, options)).toThrow(
      expect.objectContaining({
        cause: expect.objectContaining({
          message: expect.stringContaining(
            "JSONSchema target 'openapi-3.0' is not supported",
          ),
        }),
        message: 'standard-json: Unsupported schema vendor "arktype".',
      }),
    );

    const jsonSchema = { properties, required: ["name"], type: "object" };
    expect(await toJsonSchema(schema, options)).toEqual(jsonSchema);
    expect(toJsonSchema.sync(schema, options)).toEqual(jsonSchema);
  });
});
