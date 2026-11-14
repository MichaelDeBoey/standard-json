import type { JSONSchema7 } from "json-schema";
import type { Validator } from "typebox/compile";
import type { ToJsonSchemaFn } from "./utils.js";

export default function getToJsonSchemaFn(): ToJsonSchemaFn {
  return (schema) =>
    // The Standard Schema adapter `typebox` points to from 1.0.28 carries
    // Standard JSON Schema, which converts it before this handler is tried.
    JSON.parse(JSON.stringify((schema as Validator).Type())) as JSONSchema7;
}
