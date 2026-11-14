import * as v from "valibot";
import { toStandardJsonSchema } from "valibot-to-json-schema-1.8";
import { describe, expect, it } from "vitest";

import { coldToJsonSchema } from "./cold.js";

describe("valibot", () => {
  it("converts a schema wrapped in toStandardJsonSchema through its converter, before the handler is loaded", async () => {
    const toJsonSchema = await coldToJsonSchema();
    const schema = toStandardJsonSchema(
      v.object({ pinned: v.optional(v.boolean(), false), title: v.string() }),
    );
    const jsonSchema = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      properties: {
        pinned: { default: false, type: "boolean" },
        title: { type: "string" },
      },
      required: ["title"],
      type: "object",
    };

    expect(toJsonSchema.sync(schema)).toEqual(jsonSchema);
    expect(await toJsonSchema(schema)).toEqual(jsonSchema);
  });

  it("keeps the converter's error as the cause when the handler can't read the wrapper", async () => {
    const toJsonSchema = await coldToJsonSchema();
    const schema = toStandardJsonSchema(v.object({ createdAt: v.date() }));

    await expect(toJsonSchema(schema)).rejects.toThrow(
      expect.objectContaining({
        cause: expect.objectContaining({
          message: 'The "date" schema cannot be converted to JSON Schema.',
        }),
      }),
    );
  });

  it("converts a schema without the wrapper, which carries no converter, through the handler", async () => {
    const toJsonSchema = await coldToJsonSchema();
    const schema = v.object({ title: v.string() });

    expect(() => toJsonSchema.sync(schema)).toThrow(
      'standard-json: Unsupported schema vendor "valibot".',
    );
    expect(await toJsonSchema(schema)).toMatchObject({
      properties: { title: { type: "string" } },
      required: ["title"],
      type: "object",
    });
  });
});
