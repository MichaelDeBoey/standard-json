import { Schema, SchemaGetter } from "effect-4";
import { describe, expect, it, vi } from "vitest";

import { toJsonSchema } from "~/index.js";

import { coldToJsonSchema } from "./cold.js";

type Convertible = Parameters<typeof toJsonSchema>[0];

const withoutDialect = ({
  $schema: _,
  ...jsonSchema
}: object & {
  $schema?: unknown;
}) => jsonSchema as Record<string, unknown>;

const convert = async (schema: unknown, options: Record<string, unknown>) =>
  withoutDialect(await toJsonSchema(schema as Convertible, options));

// `toJsonSchema.sync` needs the vendor's handler, which `toJsonSchema` loads.
const convertSync = async (
  schema: unknown,
  options: Record<string, unknown>,
) => {
  await toJsonSchema(schema as Convertible);
  return withoutDialect(toJsonSchema.sync(schema as Convertible, options));
};

// `effect` 3 is the one installed as `effect`, so the handler is given 4.x.
vi.mock("effect", () => import("effect-4"));

describe("effect 4", () => {
  it("effect", async () => {
    const schema = Schema.Struct({
      myString: Schema.String,
      myUnion: Schema.Union([Schema.Finite, Schema.Boolean]),
    });

    const jsonSchema = await toJsonSchema(Schema.toStandardSchemaV1(schema));
    expect(jsonSchema).toEqual({
      $schema: "http://json-schema.org/draft-07/schema#",
      additionalProperties: true,
      properties: {
        myString: { type: "string" },
        myUnion: { anyOf: [{ type: "number" }, { type: "boolean" }] },
      },
      required: ["myString", "myUnion"],
      type: "object",
    });
  });

  it("effect with a definition", async () => {
    const Tag = Schema.String.annotate({ identifier: "Tag" });
    const schema = Schema.Struct({ tags: Schema.Array(Tag) });

    const jsonSchema = await toJsonSchema(Schema.toStandardSchemaV1(schema));
    expect(jsonSchema).toEqual({
      $schema: "http://json-schema.org/draft-07/schema#",
      additionalProperties: true,
      definitions: { Tag: { type: "string" } },
      properties: {
        tags: { items: { $ref: "#/definitions/Tag" }, type: "array" },
      },
      required: ["tags"],
      type: "object",
    });
  });

  it("converts the input or the output", async () => {
    const schema = Schema.toStandardSchemaV1(
      Schema.Struct({ quantity: Schema.FiniteFromString }),
    );

    expect((await convert(schema, { io: "input" })).properties).toEqual({
      quantity: { type: "string" },
    });
    expect((await convert(schema, { io: "output" })).properties).toEqual({
      quantity: { type: "number" },
    });
  });

  describe.each([
    ["toJsonSchema", convert],
    ["toJsonSchema.sync", convertSync],
  ])("with %s", (_, run) => {
    const Name = Schema.String.check(Schema.isMaxLength(10));
    const Quantity = Schema.Finite.check(Schema.isGreaterThan(0));
    const name = { maxLength: 10, type: "string" };
    const quantity = { exclusiveMinimum: 0, type: "number" };
    const convertSide = (
      schema: Schema.Decoder<unknown>,
      io: "input" | "output",
    ) => run(Schema.toStandardSchemaV1(schema), { io });

    it.each(["input", "output"] as const)(
      "keeps the refinements in the %s",
      async (io) => {
        expect(await convertSide(Name, io)).toMatchObject(name);
        expect(await convertSide(Quantity, io)).toMatchObject(quantity);
        expect(
          await convertSide(
            Schema.Struct({ name: Name, quantity: Quantity }),
            io,
          ),
        ).toMatchObject({ properties: { name, quantity } });
      },
    );

    it("keeps each refinement on the side of the transformation it's on", async () => {
      const Count = Name.pipe(
        Schema.decodeTo(Quantity, {
          decode: SchemaGetter.transform(Number),
          encode: SchemaGetter.transform(String),
        }),
      );

      expect(await convertSide(Count, "input")).toMatchObject(name);
      expect(await convertSide(Count, "output")).toMatchObject(quantity);
    });
  });

  describe("with toStandardJSONSchemaV1", () => {
    const Tag = Schema.String.annotate({ identifier: "Tag" });
    // It carries Standard JSON Schema without `validate`, so its type isn't
    // a Standard Schema.
    const schema = Schema.toStandardJSONSchemaV1(
      Schema.Struct({ tags: Schema.Array(Tag) }),
    ) as unknown as Convertible;

    it.each([
      ["without a target", {}],
      ["for the draft-2020-12 target", { target: "draft-2020-12" }],
    ])(
      "converts through its own converter to draft 2020-12 %s, before the handler is loaded",
      async (_, options) => {
        const toJsonSchema = await coldToJsonSchema();
        const jsonSchema = {
          $defs: { Tag: { type: "string" } },
          additionalProperties: true,
          properties: {
            tags: { items: { $ref: "#/$defs/Tag" }, type: "array" },
          },
          required: ["tags"],
          type: "object",
        };

        expect(toJsonSchema.sync(schema, options)).toEqual(jsonSchema);
        expect(await toJsonSchema(schema, options)).toEqual(jsonSchema);
      },
    );

    it("falls back to the handler for a target its converter doesn't support", async () => {
      const toJsonSchema = await coldToJsonSchema();
      const options = { target: "openapi-3.0" };

      // Only the async entry can load the handler to fall back to.
      expect(() => toJsonSchema.sync(schema, options)).toThrow(
        expect.objectContaining({
          cause: expect.objectContaining({
            message: "Unsupported target: openapi-3.0",
          }),
          message: 'standard-json: Unsupported schema vendor "effect".',
        }),
      );

      const jsonSchema = {
        $schema: "http://json-schema.org/draft-07/schema#",
        additionalProperties: true,
        definitions: { Tag: { type: "string" } },
        properties: {
          tags: { items: { $ref: "#/definitions/Tag" }, type: "array" },
        },
        required: ["tags"],
        type: "object",
      };
      expect(await toJsonSchema(schema, options)).toEqual(jsonSchema);
      expect(toJsonSchema.sync(schema, options)).toEqual(jsonSchema);
    });
  });

  it("converts a schema from toStandardSchemaV1, which carries no converter, through the handler", async () => {
    const toJsonSchema = await coldToJsonSchema();
    const schema = Schema.toStandardSchemaV1(
      Schema.Struct({ name: Schema.String }),
    );

    expect(() => toJsonSchema.sync(schema)).toThrow(
      'standard-json: Unsupported schema vendor "effect".',
    );
    expect(await toJsonSchema(schema)).toMatchObject({
      $schema: "http://json-schema.org/draft-07/schema#",
      properties: { name: { type: "string" } },
    });
  });
});
