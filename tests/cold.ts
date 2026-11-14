import { vi } from "vitest";

// A fresh copy of the package, as a process that hasn't converted anything yet
// has it: no vendor's handler is loaded, so `toJsonSchema.sync` can only use
// the Standard JSON Schema a schema carries.
export const coldToJsonSchema = async () => {
  vi.resetModules();

  return (await import("~/index.js")).toJsonSchema;
};
