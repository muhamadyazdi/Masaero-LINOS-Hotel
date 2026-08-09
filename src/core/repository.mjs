/**
 * Persistence facade used by host adapters.
 * Phase 1 local/demo uses the in-memory store; Postgres migrations define the durable schema.
 */
export class HotelRepository {
  constructor(store) {
    this.store = store;
  }

  list(name, predicate) {
    return this.store.list(name, predicate);
  }

  find(name, predicate) {
    return this.store.find(name, predicate);
  }

  insert(name, row) {
    return this.store.insert(name, row);
  }

  update(name, id, patch) {
    return this.store.update(name, id, patch);
  }

  remove(name, predicate) {
    return this.store.remove(name, predicate);
  }

  adjustStock(fields) {
    return this.store.adjustStock(fields);
  }

  snapshot() {
    return this.store.snapshot();
  }
}
