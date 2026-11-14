import type { StandardSchemaV1 } from "@standard-schema/spec";
import { quansync } from "quansync";
import { builtInVendors, getToJsonSchemaFn } from "./vendors/index.js";
import {
  fromStandardJsonSchema,
  type ToJsonSchemaFn,
  UnsupportedVendorError,
  validationMapper,
} from "./vendors/utils.js";

type TypeBoxValidator = {
  Check: (value: unknown) => unknown;
  Errors: (value: unknown) => unknown;
  Type: () => unknown;
};

// `typebox` dropped Standard Schema in 1.0.28, so a validator from its
// `Compile` no longer carries `~standard` and is recognised by its methods.
const isTypeBoxValidator = (schema: object): schema is TypeBoxValidator =>
  !("~standard" in schema) &&
  ["Check", "Errors", "Type"].every(
    (method) =>
      typeof (schema as Record<string, unknown>)[method] === "function",
  );

const vendorOf = (schema: StandardSchemaV1 | TypeBoxValidator) =>
  isTypeBoxValidator(schema) ? "typebox" : schema["~standard"].vendor;

// Vendors whose handler was registered with `loadVendor`, which goes before
// the Standard JSON Schema a schema carries. A built-in handler is cached in
// the same map once loaded, but is only the fallback.
const registeredVendors = new Set<string>();

const registeredHandler = (vendor: string) =>
  registeredVendors.has(vendor) ? validationMapper.get(vendor) : undefined;

// The built-in handler a schema falls back to may fail as well. Its error
// then keeps the converter's as its `cause`, so the reason the converter
// gave isn't lost.
const withCause = (error: unknown, cause: unknown) => {
  if (
    error instanceof Error &&
    error.cause === undefined &&
    Object.isExtensible(error)
  ) {
    Object.defineProperty(error, "cause", {
      configurable: true,
      value: cause,
      writable: true,
    });
  }

  return error;
};

/**
 * Converts a Standard Schema to a JSON schema.
 *
 * A handler registered with `loadVendor` wins. Otherwise, a schema that
 * carries Standard JSON Schema converts through it, and its vendor's built-in
 * handler is the fallback: for a schema that carries none, and for one whose
 * converter throws, as it does for a target the library doesn't support.
 */
export const toJsonSchema = quansync({
  sync: (
    schema: StandardSchemaV1 | TypeBoxValidator,
    options?: Record<string, unknown>,
  ) => {
    const vendor = vendorOf(schema);
    const registered = registeredHandler(vendor);
    if (registered) {
      return registered(schema, options);
    }

    const carried = fromStandardJsonSchema(schema);
    if (!carried) {
      const fn = validationMapper.get(vendor);
      if (!fn) {
        throw new UnsupportedVendorError(vendor);
      }

      return fn(schema, options);
    }

    try {
      return carried(schema, options);
    } catch (error) {
      if (!builtInVendors.has(vendor)) {
        throw error;
      }

      // Only the async entry can load the handler to fall back to.
      const fn = validationMapper.get(vendor);
      if (!fn) {
        throw new UnsupportedVendorError(vendor, { cause: error });
      }

      try {
        return fn(schema, options);
      } catch (fallbackError) {
        throw withCause(fallbackError, error);
      }
    }
  },
  async: async (
    schema: StandardSchemaV1 | TypeBoxValidator,
    options?: Record<string, unknown>,
  ) => {
    const vendor = vendorOf(schema);
    const registered = registeredHandler(vendor);
    if (registered) {
      return registered(schema, options);
    }

    const carried = fromStandardJsonSchema(schema);
    if (!carried) {
      const fn = await getToJsonSchemaFn(vendor);

      return fn(schema, options);
    }

    try {
      return carried(schema, options);
    } catch (error) {
      if (!builtInVendors.has(vendor)) {
        throw error;
      }

      // The handler is only loaded when the converter throws, so a schema
      // whose converter works never imports it.
      try {
        const fn = await getToJsonSchemaFn(vendor);

        return await fn(schema, options);
      } catch (fallbackError) {
        throw withCause(fallbackError, error);
      }
    }
  },
});

export function loadVendor(vendor: string, fn: ToJsonSchemaFn) {
  registeredVendors.add(vendor);
  validationMapper.set(vendor, fn);
}
