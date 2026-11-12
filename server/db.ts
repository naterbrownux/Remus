import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  Album,
  AlbumWithDetails,
  LinerNote,
  StorageRoot,
  Track,
} from '../packages/shared/src/types.ts';
import { ensureWavFile, type SoundProfile } from './audio.ts';

const ROOT_DIR = process.cwd();
const DB_PATH = path.join(ROOT_DIR, 'remus.db');
const SCHEMA_PATH = path.join(ROOT_DIR, 'packages', 'shared', 'schema.sql');
export const STORAGE_MUSIC_DIR = path.join(ROOT_DIR, 'storage', 'music');
export const STORAGE_LINER_DIR = path.join(ROOT_DIR, 'storage', 'liner_notes');

fs.mkdirSync(STORAGE_MUSIC_DIR, { recursive: true });
fs.mkdirSync(STORAGE_LINER_DIR, { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA foreign_keys = ON;');

const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf-8');
db.exec(schemaSql);

export function seedInitialLibrary() {
  const existingRoots = db
    .prepare('SELECT COUNT(*) as count FROM storage_roots')
    .get() as { count: number };

  if (existingRoots.count > 0) {
    // Ensure WAV files exist on disk even after container restarts
    const tracks = db.prepare('SELECT relative_file_path, album_id, track_number FROM tracks').all() as Array<{
      relative_file_path: string;
      album_id: string;
      track_number: number;
    }>;
    for (const tr of tracks) {
      const profile: SoundProfile = tr.album_id.includes('blue')
        ? 'jazz'
        : tr.album_id.includes('tokyo')
          ? 'ambient'
          : tr.album_id.includes('drift')
            ? 'tape'
            : tr.album_id.includes('brass')
              ? 'cello'
              : 'piano';
      ensureWavFile(path.join(STORAGE_MUSIC_DIR, tr.relative_file_path), profile, tr.track_number, 14);
    }
    return;
  }

  const insertRoot = db.prepare(`
    INSERT INTO storage_roots (id, name, provider_type, base_uri, default_media_format, is_online)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insertRoot.run('root-vinyl-ssd', 'Studio Vinyl Transfers (NVMe)', 'local_fs', 'file:///Volumes/RemusAudio/Vinyl', 'vinyl', 1);
  insertRoot.run('root-cd-nas', 'Main FLAC Archive (Synology SMB)', 'smb', 'smb://nas.local/music/lossless', 'cd', 1);
  insertRoot.run('root-cassette-dock', 'Analog Cassette Deck Captures', 'local_fs', 'file:///Volumes/RemusAudio/Tapes', 'cassette', 1);
  insertRoot.run('root-webdav-offsite', 'Archival Offsite Mirror', 'webdav', 'https://archive.local/dav/remus', 'digital', 0);

  const insertAlbum = db.prepare(`
    INSERT INTO albums (
      id, storage_root_id, relative_folder_path, title, artist, release_year,
      media_format, catalog_number, record_label, pressing_notes, metadata_source, needs_liner_notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertAlbum.run(
    'alb-blue-sax',
    'root-vinyl-ssd',
    'Clifford_Coleman/Blue_Sax_1964',
    'Blue Sax',
    'Clifford Coleman',
    1964,
    'vinyl',
    'AB-4192',
    'Aqua Blue Records',
    'Original 1964 Plastylite deep-groove mono/stereo pressing · Van Gelder stamped deadwax · 24-bit / 96kHz ADC transfer via Lynx Hilo.',
    'Discogs',
    0
  );

  insertAlbum.run(
    'alb-tokyo-rain',
    'root-vinyl-ssd',
    'Kuroda_Kenji/Ambient_Works_Vol_1',
    'Ambient Works Vol. 1 (環境音楽 第一集)',
    'Kenji Kuroda',
    1986,
    'vinyl',
    'KTO-019',
    'Kyoto Sound Editions',
    '180g Japanese virgin vinyl pressing with original Obi strip · Mastered half-speed at JVC Yokohama.',
    'MusicBrainz',
    0
  );

  insertAlbum.run(
    'alb-pacific-drift',
    'root-cassette-dock',
    'ALS/Pacific_Drift_1982',
    'Pacific Drift (PCH 1982)',
    'A.L.S.',
    1982,
    'cassette',
    'KD-1982-C',
    'Kodachrome Tapes',
    'Chrome Type II CrO2 cassette · Dolby B off · Captured via Nakamichi Dragon calibrated azimuth.',
    'Manual',
    0
  );

  insertAlbum.run(
    'alb-harmonies-brass',
    'root-cd-nas',
    'David_Chen/Harmonies_In_Brass',
    'Harmonies in Brass: Cello Masterworks',
    'David Chen',
    2019,
    'cd',
    'CAC-8841',
    'Chamber Audiophile Editions',
    'Pure DSD-to-PCM Red Book CD master · Ripped securely via AccurateRip v2.',
    'AccurateRip + MusicBrainz',
    1
  );

  const insertTrack = db.prepare(`
    INSERT INTO tracks (
      id, album_id, relative_file_path, disc_number, track_number, title, artist,
      duration_ms, sample_rate, bit_depth, codec, accuraterip_confidence, gapless_next_track_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const seedTracks: Array<{
    id: string;
    albumId: string;
    file: string;
    num: number;
    title: string;
    artist: string;
    sr: number;
    bd: number;
    codec: string;
    ar: number | null;
    nextId: string | null;
    profile: SoundProfile;
  }> = [
    // Blue Sax
    { id: 'trk-bs-1', albumId: 'alb-blue-sax', file: 'Clifford_Coleman/Blue_Sax_1964/01_midnight_reed.wav', num: 1, title: 'Midnight Reed (Side A1)', artist: 'Clifford Coleman', sr: 96000, bd: 24, codec: 'WAV', ar: null, nextId: 'trk-bs-2', profile: 'jazz' },
    { id: 'trk-bs-2', albumId: 'alb-blue-sax', file: 'Clifford_Coleman/Blue_Sax_1964/02_velvet_session.wav', num: 2, title: 'Velvet Session at Englewood', artist: 'Clifford Coleman', sr: 96000, bd: 24, codec: 'WAV', ar: null, nextId: 'trk-bs-3', profile: 'jazz' },
    { id: 'trk-bs-3', albumId: 'alb-blue-sax', file: 'Clifford_Coleman/Blue_Sax_1964/03_aquablue_ballad.wav', num: 3, title: 'Aqua Blue Ballad (Side B1)', artist: 'Clifford Coleman', sr: 96000, bd: 24, codec: 'WAV', ar: null, nextId: null, profile: 'jazz' },

    // Ambient Works Vol 1
    { id: 'trk-aw-1', albumId: 'alb-tokyo-rain', file: 'Kuroda_Kenji/Ambient_Works_Vol_1/01_moss_pavilion.wav', num: 1, title: 'Moss Pavilion in Rain', artist: 'Kenji Kuroda', sr: 96000, bd: 24, codec: 'FLAC', ar: null, nextId: 'trk-aw-2', profile: 'ambient' },
    { id: 'trk-aw-2', albumId: 'alb-tokyo-rain', file: 'Kuroda_Kenji/Ambient_Works_Vol_1/02_paper_lantern.wav', num: 2, title: 'Shoji & Paper Lantern', artist: 'Kenji Kuroda', sr: 96000, bd: 24, codec: 'FLAC', ar: null, nextId: 'trk-aw-3', profile: 'ambient' },
    { id: 'trk-aw-3', albumId: 'alb-tokyo-rain', file: 'Kuroda_Kenji/Ambient_Works_Vol_1/03_cedar_courtyard.wav', num: 3, title: 'Cedar Courtyard Dusk', artist: 'Kenji Kuroda', sr: 96000, bd: 24, codec: 'FLAC', ar: null, nextId: null, profile: 'ambient' },

    // Pacific Drift
    { id: 'trk-pd-1', albumId: 'alb-pacific-drift', file: 'ALS/Pacific_Drift_1982/01_big_sur_overlook.wav', num: 1, title: 'Big Sur Overlook (Side A)', artist: 'A.L.S.', sr: 48000, bd: 24, codec: 'WAV', ar: null, nextId: 'trk-pd-2', profile: 'tape' },
    { id: 'trk-pd-2', albumId: 'alb-pacific-drift', file: 'ALS/Pacific_Drift_1982/02_coastal_fog_tape.wav', num: 2, title: 'Coastal Fog & Chrome Tape', artist: 'A.L.S.', sr: 48000, bd: 24, codec: 'WAV', ar: null, nextId: null, profile: 'tape' },

    // Harmonies in Brass
    { id: 'trk-hb-1', albumId: 'alb-harmonies-brass', file: 'David_Chen/Harmonies_In_Brass/01_prelude_in_g.wav', num: 1, title: 'I. Prelude in G Minor (Unaccompanied)', artist: 'David Chen', sr: 44100, bd: 16, codec: 'FLAC', ar: 64, nextId: 'trk-hb-2', profile: 'cello' },
    { id: 'trk-hb-2', albumId: 'alb-harmonies-brass', file: 'David_Chen/Harmonies_In_Brass/02_sarabande_spruce.wav', num: 2, title: 'II. Sarabande in Spruce & Brass', artist: 'David Chen', sr: 44100, bd: 16, codec: 'FLAC', ar: 64, nextId: 'trk-hb-3', profile: 'cello' },
    { id: 'trk-hb-3', albumId: 'alb-harmonies-brass', file: 'David_Chen/Harmonies_In_Brass/03_coda_resonant.wav', num: 3, title: 'III. Resonant Coda', artist: 'David Chen', sr: 44100, bd: 16, codec: 'FLAC', ar: 61, nextId: null, profile: 'cello' },
  ];

  for (const t of seedTracks) {
    const durationMs = ensureWavFile(path.join(STORAGE_MUSIC_DIR, t.file), t.profile, t.num, 14);
    insertTrack.run(
      t.id,
      t.albumId,
      t.file,
      1,
      t.num,
      t.title,
      t.artist,
      durationMs,
      t.sr,
      t.bd,
      t.codec,
      t.ar,
      t.nextId
    );
  }

  const insertLiner = db.prepare(`
    INSERT INTO liner_notes (
      id, album_id, page_type, page_order, relative_image_path, extracted_ocr_text, ai_confidence_score
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  insertLiner.run(
    'ln-bs-front',
    'alb-blue-sax',
    'front_cover',
    1,
    '/src/assets/images/album_cover_midnight_blue_1794508287278.jpg',
    'BLUE SAX — CLIFFORD COLEMAN · STEREO 1964 · AQUA BLUE RECORDS AB-4192',
    0.98
  );

  insertLiner.run(
    'ln-bs-gatefold',
    'alb-blue-sax',
    'gatefold',
    2,
    '/src/assets/images/liner_gatefold_scan_1794508289429.jpg',
    'SESSION TAPES: THE MISSING HOURS\nRecorded live to two-track Ampex 351 quarter-inch tape at Studio B, March 1964.\nPersonnel: Clifford Coleman (Tenor Saxophone), Marcus Vance (Upright Bass), Leon Grant (Drums), K. Anderson (Recording Engineer).\nMastered directly from original session reels without dynamic compression.',
    0.96
  );

  insertLiner.run(
    'ln-aw-front',
    'alb-tokyo-rain',
    'front_cover',
    1,
    '/src/assets/images/album_cover_tokyo_rain_1794508288637.jpg',
    'AMBIENT WORKS VOL. 1 · 環境音楽 第一集 · KYOTO SOUND EDITIONS KTO-019',
    0.97
  );

  insertLiner.run(
    'ln-pd-jcard',
    'alb-pacific-drift',
    'j_card',
    1,
    '/src/assets/images/album_cover_analog_drift_1794508288561.jpg',
    'PCH 1982 / KODACHROME / PACIFIC DRIFT\nA.L.S. — PACIFIC COAST HIGHWAY AMBIENT SELECTIONS\nRecorded on location between Carmel and Big Sur using Sony TC-D5M portable cassette deck.',
    0.95
  );

  insertLiner.run(
    'ln-hb-front',
    'alb-harmonies-brass',
    'front_cover',
    1,
    '/src/assets/images/album_cover_chamber_works_1794508288941.jpg',
    'CLASSICAL AUDIOPHILE COLLECTION · HARMONIES IN BRASS — CELLO MASTERWORKS · DAVID CHEN | CELLO',
    0.99
  );
}

export function getAllStorageRoots(): StorageRoot[] {
  return db
    .prepare('SELECT * FROM storage_roots ORDER BY is_online DESC, name ASC')
    .all() as unknown as StorageRoot[];
}

export function getAllAlbumsWithDetails(): AlbumWithDetails[] {
  const albums = db
    .prepare(
      `SELECT a.*, sr.name as storage_root_name
       FROM albums a
       LEFT JOIN storage_roots sr ON a.storage_root_id = sr.id
       ORDER BY a.created_at DESC, a.title ASC`
    )
    .all() as unknown as Array<Album & { storage_root_name: string | null }>;

  const allTracks = db
    .prepare('SELECT * FROM tracks ORDER BY album_id, disc_number ASC, track_number ASC')
    .all() as unknown as Track[];

  const allLinerNotes = db
    .prepare('SELECT * FROM liner_notes ORDER BY album_id, page_order ASC')
    .all() as unknown as LinerNote[];

  return albums.map((album) => ({
    ...album,
    tracks: allTracks.filter((t) => t.album_id === album.id),
    liner_notes: allLinerNotes.filter((ln) => ln.album_id === album.id),
  }));
}

export function getAlbumById(albumId: string): AlbumWithDetails | null {
  const album = db
    .prepare(
      `SELECT a.*, sr.name as storage_root_name
       FROM albums a
       LEFT JOIN storage_roots sr ON a.storage_root_id = sr.id
       WHERE a.id = ?`
    )
    .get(albumId) as (Album & { storage_root_name: string | null }) | undefined;

  if (!album) return null;

  const tracks = db
    .prepare('SELECT * FROM tracks WHERE album_id = ? ORDER BY disc_number ASC, track_number ASC')
    .all(albumId) as unknown as Track[];

  const liner_notes = db
    .prepare('SELECT * FROM liner_notes WHERE album_id = ? ORDER BY page_order ASC')
    .all(albumId) as unknown as LinerNote[];

  return { ...album, tracks, liner_notes };
}
