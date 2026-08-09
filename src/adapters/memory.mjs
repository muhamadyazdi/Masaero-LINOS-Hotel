import { createMemoryStore } from "../core/memoryStore.mjs";

let singleton = null;

export function getMemoryStore() {
  if (!singleton) singleton = createMemoryStore();
  return singleton;
}

export function resetMemoryStore() {
  singleton = createMemoryStore();
  return singleton;
}
