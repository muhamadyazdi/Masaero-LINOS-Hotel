-- Per-room linen/furnishing relevance overrides (category×bed standards remain the default).
CREATE TABLE IF NOT EXISTS room_linen_requirements (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  linen_item_id TEXT NOT NULL REFERENCES linen_items(id),
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  included BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (room_id, linen_item_id)
);

CREATE INDEX IF NOT EXISTS idx_room_linen_requirements_room
  ON room_linen_requirements (room_id);
