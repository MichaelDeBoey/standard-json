import { describe, expect, it, vi } from "vitest";
import { z } from "zod-4";
import { z as zm } from "zod-4/mini";
import { z as z3 } from "zod-4/v3";

import { coldToJsonSchema } from "./cold.js";

// `zod` 3.25 is the one installed as `zod`, so the handler is given 4.x.
vi.mock("zod/v4/core", () => import("zod-4/v4/core"));

describe("zod 4", () => {
  it("converts a schema through its own converter, before the handler is loaded", async () => {
    const toJsonSchema = await coldToJsonSchema();
    const schema = z.object({ quantity: z.number().default(1) });
    const jsonSchema = {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      properties: { quantity: { default: 1, type: "number" } },
      type: "object",
    };

    expect(toJsonSchema.sync(schema)).toEqual(jsonSchema);
    expect(await toJsonSchema(schema)).toEqual(jsonSchema);
  });

  it("keeps the converter's error as the cause when the handler can't convert a schema either", async () => {
    const toJsonSchema = await coldToJsonSchema();
    const schema = z.object({ createdAt: z.date() });
    const cause = expect.objectContaining({
      message: "Date cannot be represented in JSON Schema",
    });

    expect(() => toJsonSchema.sync(schema)).toThrow(
      expect.objectContaining({
        cause,
        message: 'standard-json: Unsupported schema vendor "zod".',
      }),
    );
    await expect(toJsonSchema(schema)).rejects.toThrow(
      expect.objectContaining({
        cause,
        message: "Date cannot be represented in JSON Schema",
      }),
    );
    expect(() => toJsonSchema.sync(schema)).toThrow(
      expect.objectContaining({
        cause,
        message: "Date cannot be represented in JSON Schema",
      }),
    );
  });

  it.each([
    ["zod 3", z3.object({ quantity: z3.number() })],
    ["zod mini", zm.object({ quantity: zm.number() })],
  ])(
    "converts a %s schema, which carries no converter, through the handler",
    async (_, schema) => {
      const toJsonSchema = await coldToJsonSchema();

      expect(() => toJsonSchema.sync(schema)).toThrow(
        'standard-json: Unsupported schema vendor "zod".',
      );
      expect(await toJsonSchema(schema)).toMatchObject({
        properties: { quantity: { type: "number" } },
        required: ["quantity"],
        type: "object",
      });
    },
  );
});
