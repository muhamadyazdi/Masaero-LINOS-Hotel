-- Room-task extras (guest/ops over-and-above the fitted set) and preset kits.
CREATE TABLE IF NOT EXISTS extra_kits (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  default_reason_code TEXT NOT NULL DEFAULT 'GuestRequest',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (property_id, code)
);

CREATE TABLE IF NOT EXISTS extra_kit_lines (
  id TEXT PRIMARY KEY,
  kit_id TEXT NOT NULL REFERENCES extra_kits(id) ON DELETE CASCADE,
  linen_item_id TEXT NOT NULL REFERENCES linen_items(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (kit_id, linen_item_id)
);

CREATE TABLE IF NOT EXISTS room_task_extra_lines (
  id TEXT PRIMARY KEY,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  room_task_id TEXT NOT NULL REFERENCES room_tasks(id) ON DELETE CASCADE,
  room_id TEXT NOT NULL REFERENCES rooms(id),
  daily_round_id TEXT NOT NULL REFERENCES daily_rounds(id),
  linen_item_id TEXT NOT NULL REFERENCES linen_items(id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  clean_in_qty INTEGER NOT NULL DEFAULT 0 CHECK (clean_in_qty >= 0),
  soiled_out_qty INTEGER NOT NULL DEFAULT 0 CHECK (soiled_out_qty >= 0),
  reason_code TEXT NOT NULL,
  reason_note TEXT,
  requested_by_user_id TEXT REFERENCES users(id),
  requested_source TEXT NOT NULL DEFAULT 'guest',
  approved_by_user_id TEXT REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'Requested',
  kit_id TEXT REFERENCES extra_kits(id),
  kit_instance_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_room_task_extra_lines_task
  ON room_task_extra_lines (room_task_id);

CREATE INDEX IF NOT EXISTS idx_room_task_extra_lines_room_status
  ON room_task_extra_lines (room_id, status);

CREATE INDEX IF NOT EXISTS idx_extra_kit_lines_kit
  ON extra_kit_lines (kit_id);
