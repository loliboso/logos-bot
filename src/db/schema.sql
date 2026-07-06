CREATE TABLE IF NOT EXISTS scanner_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  files_found INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running'
);

CREATE TABLE IF NOT EXISTS brands (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  aliases TEXT NOT NULL DEFAULT '[]',
  brand_group TEXT,
  importance TEXT NOT NULL DEFAULT 'primary',
  drive_folder_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  brand_id TEXT NOT NULL REFERENCES brands(id),
  asset_type TEXT NOT NULL,
  variant TEXT NOT NULL,
  language TEXT,
  format TEXT NOT NULL,
  color TEXT,
  background TEXT DEFAULT 'transparent',
  layout TEXT,
  usage TEXT NOT NULL DEFAULT '["general"]',
  source_drive_file_id TEXT NOT NULL,
  source_path TEXT NOT NULL,
  intrinsic_width INTEGER,
  intrinsic_height INTEGER,
  can_resize INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  confidence REAL NOT NULL DEFAULT 0.0,
  inferred_from TEXT NOT NULL DEFAULT '[]',
  review_status TEXT NOT NULL DEFAULT 'pending',
  review_reason TEXT,
  scanner_run_id INTEGER REFERENCES scanner_runs(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS manual_overrides (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  override_value TEXT NOT NULL,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(asset_id, field_name)
);

CREATE TABLE IF NOT EXISTS generated_outputs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_asset_id TEXT NOT NULL REFERENCES assets(id),
  requested_width INTEGER NOT NULL,
  requested_height INTEGER NOT NULL,
  background TEXT NOT NULL DEFAULT 'transparent',
  output_format TEXT NOT NULL DEFAULT 'png',
  file_path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(source_asset_id, requested_width, requested_height, background, output_format)
);

CREATE INDEX IF NOT EXISTS idx_assets_brand ON assets(brand_id);
CREATE INDEX IF NOT EXISTS idx_assets_status ON assets(status, review_status);
CREATE INDEX IF NOT EXISTS idx_assets_format ON assets(format);
CREATE INDEX IF NOT EXISTS idx_overrides_asset ON manual_overrides(asset_id);
