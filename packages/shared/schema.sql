CREATE TABLE IF NOT EXISTS storage_roots (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    provider_type TEXT NOT NULL,     -- 'local_fs' | 'smb' | 'webdav'
    base_uri TEXT NOT NULL,
    default_media_format TEXT,       -- 'vinyl' | 'cd' | 'cassette' | 'digital'
    is_online INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS albums (
    id TEXT PRIMARY KEY,
    storage_root_id TEXT REFERENCES storage_roots(id),
    relative_folder_path TEXT NOT NULL,
    title TEXT NOT NULL,
    artist TEXT NOT NULL,
    release_year INTEGER,
    media_format TEXT NOT NULL,
    catalog_number TEXT,
    record_label TEXT,
    pressing_notes TEXT,
    metadata_source TEXT,
    needs_liner_notes INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS tracks (
    id TEXT PRIMARY KEY,
    album_id TEXT REFERENCES albums(id) ON DELETE CASCADE,
    relative_file_path TEXT NOT NULL,
    disc_number INTEGER DEFAULT 1,
    track_number INTEGER NOT NULL,
    title TEXT NOT NULL,
    artist TEXT,
    duration_ms INTEGER NOT NULL,
    sample_rate INTEGER,
    bit_depth INTEGER,
    codec TEXT,
    accuraterip_confidence INTEGER,
    gapless_next_track_id TEXT
);

CREATE TABLE IF NOT EXISTS liner_notes (
    id TEXT PRIMARY KEY,
    album_id TEXT REFERENCES albums(id) ON DELETE CASCADE,
    page_type TEXT NOT NULL,         -- 'front_cover' | 'back_cover' | 'gatefold' | 'booklet' | 'j_card'
    page_order INTEGER NOT NULL,
    relative_image_path TEXT NOT NULL,
    extracted_ocr_text TEXT,
    ai_confidence_score REAL
);
