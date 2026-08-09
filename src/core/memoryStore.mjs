import { newId, nowIso } from "./model.mjs";

function clone(value) {
  return structuredClone(value);
}

function locKey(row) {
  return [
    row.property_id,
    row.linen_item_id,
    row.bucket,
    row.room_id || "",
    row.store_id || "",
    row.laundry_provider_id || "",
    row.cart_load_id || ""
  ].join("|");
}

export function createMemoryStore() {
  const db = {
    properties: [],
    users: [],
    user_floor_assignments: [],
    room_categories: [],
    bed_configs: [],
    rooms: [],
    linen_items: [],
    room_linen_standards: [],
    room_linen_requirements: [],
    room_par_levels: [],
    stores: [],
    laundry_providers: [],
    amenity_locations: [],
    exception_categories: [],
    scheduling_rules: [],
    daily_rounds: [],
    room_tasks: [],
    cart_loads: [],
    cart_load_lines: [],
    room_task_linen_lines: [],
    room_task_extra_lines: [],
    standing_extra_requests: [],
    extra_kits: [],
    extra_kit_lines: [],
    room_exceptions: [],
    evidence: [],
    linen_transactions: [],
    stock_balances: [],
    audit_events: [],
    idempotency_keys: [],
    store_collections: [],
    store_collection_lines: [],
    laundry_dispatches: [],
    laundry_dispatch_lines: [],
    laundry_returns: [],
    laundry_return_allocations: [],
    variances: [],
    feedback: []
  };
  const stockIndex = new Map();

  function rebuildStockIndex() {
    stockIndex.clear();
    for (const row of db.stock_balances) stockIndex.set(locKey(row), row);
  }

  function ensureStockIndex() {
    if (stockIndex.size !== db.stock_balances.length) rebuildStockIndex();
  }

  function table(name) {
    if (!db[name]) throw new Error(`Unknown table ${name}`);
    return db[name];
  }

  return {
    raw: db,

    list(name, predicate = () => true) {
      return clone(table(name).filter(predicate));
    },

    find(name, predicate) {
      const row = table(name).find(predicate);
      return row ? clone(row) : null;
    },

    insert(name, row) {
      const record = { ...row };
      if (!record.id) record.id = newId(name.slice(0, 3));
      if (!record.created_at) record.created_at = nowIso();
      table(name).push(record);
      if (name === "stock_balances") {
        ensureStockIndex();
        stockIndex.set(locKey(record), record);
      }
      return clone(record);
    },

    update(name, id, patch) {
      const rows = table(name);
      const index = rows.findIndex((row) => row.id === id);
      if (index < 0) return null;
      rows[index] = {
        ...rows[index],
        ...patch,
        id,
        updated_at: nowIso()
      };
      return clone(rows[index]);
    },

    remove(name, predicate) {
      const rows = table(name);
      for (let i = rows.length - 1; i >= 0; i -= 1) {
        if (predicate(rows[i])) rows.splice(i, 1);
      }
      if (name === "stock_balances") rebuildStockIndex();
    },

    adjustStock({
      property_id,
      linen_item_id,
      bucket,
      room_id = null,
      store_id = null,
      laundry_provider_id = null,
      cart_load_id = null,
      delta
    }) {
      const rows = table("stock_balances");
      ensureStockIndex();
      const target = {
        property_id,
        linen_item_id,
        bucket,
        room_id: room_id || null,
        store_id: store_id || null,
        laundry_provider_id: laundry_provider_id || null,
        cart_load_id: cart_load_id || null
      };
      const key = locKey(target);
      let row = stockIndex.get(key);
      if (!row) {
        row = {
          id: newId("stk"),
          ...target,
          quantity: 0,
          updated_at: nowIso()
        };
        rows.push(row);
        stockIndex.set(key, row);
      }
      row.quantity += Number(delta || 0);
      row.updated_at = nowIso();
      return clone(row);
    },

    snapshot() {
      return clone(db);
    }
  };
}
