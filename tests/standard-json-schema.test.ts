import type { StandardSchemaV1 } from "@standard-schema/spec";
import { describe, expect, it } from "vitest";
import { z } from "zod/v4";

import { loadVendor, toJsonSchema } from "~/index.js";

// A schema from a library standard-json does not know, carrying Standard
// JSON Schema (https://standardschema.dev/json-schema) on `~standard`: its
// input and output differ, as they do for a schema that transforms.
function ownSchema() {
  const calls: { side: string; options: unknown }[] = [];
  const document = (side: string, type: string) => ({
    type: "object",
    properties: { quantity: { type } },
    required: ["quantity"],
    $comment: side,
  });
  const schema = {
    "~standard": {
      version: 1,
      vendor: "example-with-json-schema",
      validate: (value: unknown) => ({ value }),
      jsonSchema: {
        input: (options: unknown) => {
          calls.push({ side: "input", options });
          return document("input", "string");
        },
        output: (options: unknown) => {
          calls.push({ side: "output", options });
          return document("output", "number");
        },
      },
    },
  } as unknown as StandardSchemaV1;
  return { schema, calls };
}

describe("standard json schema", () => {
  it("converts a schema that carries its own JSON Schema, async", async () => {
    const { schema, calls } = ownSchema();
    const jsonSchema = await toJsonSchema(schema);
    expect(jsonSchema).toMatchObject({
      type: "object",
      required: ["quantity"],
      $comment: "input",
    });
    expect(calls).toEqual([
      {
        side: "input",
        options: { target: "draft-2020-12", libraryOptions: undefined },
      },
    ]);
  });

  it("converts a schema that carries its own JSON Schema, sync", () => {
    const { schema, calls } = ownSchema();
    const jsonSchema = toJsonSchema.sync(schema);
    expect(jsonSchema).toMatchObject({ $comment: "input" });
    expect(calls).toHaveLength(1);
  });

  it.each(["input", "output"] as const)(
    "converts the %s when io asks for it, async and sync",
    async (io) => {
      const { schema, calls } = ownSchema();
      const type = io === "input" ? "string" : "number";
      expect(await toJsonSchema(schema, { io })).toMatchObject({
        $comment: io,
        properties: { quantity: { type } },
      });
      expect(toJsonSchema.sync(schema, { io })).toMatchObject({
        $comment: io,
        properties: { quantity: { type } },
      });
      expect(calls.map((call) => call.side)).toEqual([io, io]);
    },
  );

  it("calls input() and output() as methods, so one written with this works", async () => {
    const schema = {
      "~standard": {
        version: 1,
        vendor: "example-with-methods",
        validate: (value: unknown) => ({ value }),
        jsonSchema: {
          inputDocument: { type: "string", $comment: "input" },
          outputDocument: { type: "number", $comment: "output" },
          input() {
            return this.inputDocument;
          },
          output() {
            return this.outputDocument;
          },
        },
      },
    } as unknown as StandardSchemaV1;
    for (const io of ["input", "output"] as const) {
      expect(await toJsonSchema(schema, { io })).toMatchObject({
        $comment: io,
      });
      expect(toJsonSchema.sync(schema, { io })).toMatchObject({ $comment: io });
    }
    expect(await toJsonSchema(schema)).toMatchObject({ $comment: "input" });
  });

  it("passes the target, and the other options as the library's own, async and sync", async () => {
    const { schema, calls } = ownSchema();
    const options = { extra: 1, io: "output", target: "draft-07" };
    await toJsonSchema(schema, options);
    toJsonSchema.sync(schema, options);
    const call = {
      side: "output",
      options: { libraryOptions: { extra: 1 }, target: "draft-07" },
    };
    expect(calls).toEqual([call, call]);
  });

  it("passes no library options when only io and target are given, async and sync", async () => {
    const { schema, calls } = ownSchema();
    const options = { io: "output", target: "draft-07" };
    await toJsonSchema(schema, options);
    toJsonSchema.sync(schema, options);
    const call = {
      side: "output",
      options: { libraryOptions: undefined, target: "draft-07" },
    };
    expect(calls).toEqual([call, call]);
  });

  it("still rejects a vendor it does not know when no JSON Schema is carried", async () => {
    const schema = {
      "~standard": {
        version: 1,
        vendor: "unknown-lib",
        validate: (value: unknown) => ({ value }),
      },
    } as unknown as StandardSchemaV1;
    await expect(toJsonSchema(schema)).rejects.toThrow(
      'Unsupported schema vendor "unknown-lib"',
    );
    expect(() => toJsonSchema.sync(schema)).toThrow(
      'Unsupported schema vendor "unknown-lib"',
    );
  });

  it("converts a built-in vendor's schema through the converter it carries, cold and warm", async () => {
    // A real zod schema given a `jsonSchema` of its own that answers
    // differently from zod's handler. The converter must win on every entry,
    // whether or not the async one has loaded the handler yet.
    const schema = z.object({ quantity: z.number().default(1) });
    const carried = {
      ...schema["~standard"],
      jsonSchema: {
        input: () => ({ $comment: "carried" }),
        output: () => ({ $comment: "carried" }),
      },
    };
    Object.defineProperty(schema, "~standard", { value: carried });

    // Cold: the converter needs no handler.
    expect(toJsonSchema.sync(schema)).toEqual({ $comment: "carried" });

    // Warm: a schema that carries no converter loads the handler, which the
    // one that does still doesn't use.
    await toJsonSchema(z.object({ quantity: z.number() }));
    expect(await toJsonSchema(schema)).toEqual({ $comment: "carried" });
    expect(toJsonSchema.sync(schema)).toEqual({ $comment: "carried" });
  });

  it("throws the converter's error for a vendor without a handler, async and sync", async () => {
    const unsupported = new Error("Unsupported target: draft-04");
    const throwUnsupported = () => {
      throw unsupported;
    };
    const schema = {
      "~standard": {
        jsonSchema: { input: throwUnsupported, output: throwUnsupported },
        validate: (value: unknown) => ({ value }),
        vendor: "example-without-handler",
        version: 1,
      },
    } as unknown as StandardSchemaV1;

    await expect(toJsonSchema(schema, { target: "draft-04" })).rejects.toBe(
      unsupported,
    );
    expect(() => toJsonSchema.sync(schema, { target: "draft-04" })).toThrow(
      unsupported,
    );
  });

  it("lets a handler registered with loadVendor win over the converter a schema carries, async and sync", async () => {
    const { schema, calls } = ownSchema();
    loadVendor("example-with-json-schema", () => ({ $comment: "registered" }));

    expect(await toJsonSchema(schema)).toEqual({ $comment: "registered" });
    expect(toJsonSchema.sync(schema)).toEqual({ $comment: "registered" });
    expect(calls).toEqual([]);
  });
});
