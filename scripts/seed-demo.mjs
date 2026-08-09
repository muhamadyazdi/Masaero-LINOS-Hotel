import { getMemoryStore } from "../src/adapters/memory.mjs";
import { seedDemoProperty } from "../src/core/seed.mjs";

const store = getMemoryStore();
const result = seedDemoProperty(store);
console.log(
  JSON.stringify(
    {
      ok: true,
      property: result.property.code,
      rooms: result.rooms.length,
      users: result.users.map((u) => u.email),
      disclaimer: result.property.demo_disclaimer
    },
    null,
    2
  )
);
