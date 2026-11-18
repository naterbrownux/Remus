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

  if (existingRoots.count === 0) {
    db.prepare(
      `INSERT INTO storage_roots (id, name, provider_type, base_uri, default_media_format, is_online)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      'root-local-library',
      'Local Music Library',
      'local_fs',
      './storage/music',
      'vinyl',
      1
    );
  }

  const existingAlbums = db
    .prepare('SELECT COUNT(*) as count FROM albums')
    .get() as { count: number };

  if (existingAlbums.count > 0) {
    return;
  }

  const rootId = resolveValidStorageRootId('root-local-library');

  interface SeedRelease {
    id: string;
    folder: string;
    title: string;
    artist: string;
    releaseYear: number;
    mediaFormat: 'vinyl' | 'cd' | 'cassette' | 'digital';
    catalogNumber: string;
    recordLabel: string;
    pressingNotes: string;
    metadataSource: string;
    needsLinerNotes: number;
    coverImage: string;
    gatefoldImage?: string;
    gatefoldText?: string;
    profile: SoundProfile;
    sampleRate: number;
    bitDepth: number;
    codec: string;
    accurateripConfidence: number | null;
    tracks: string[];
  }

  const sampleReleases: SeedRelease[] = [
    {
      id: 'alb-blue-sax',
      folder: 'Clifford_Coleman/Midnight_Blue',
      title: 'Midnight Blue Sessions',
      artist: 'Clifford Coleman Quartet',
      releaseYear: 1968,
      mediaFormat: 'vinyl',
      catalogNumber: 'BN-4192',
      recordLabel: 'Blue Harbor Records',
      pressingNotes: '1st Mono Pressing · 33⅓ RPM RIAA · 24-bit / 96kHz ADC transfer',
      metadataSource: 'Vinyl ADC + Discogs',
      needsLinerNotes: 0,
      coverImage: '/src/assets/images/album_cover_midnight_blue_1794508287278.jpg',
      gatefoldImage: '/src/assets/images/liner_gatefold_scan_1794508289429.jpg',
      gatefoldText:
        'Recorded at Van Gelder Studio, Englewood Cliffs.\nTenor Saxophone: Clifford Coleman\nPiano: Harold Vance\nDouble Bass: Arthur Bell\nDrums: Roy Haynesworth',
      profile: 'jazz',
      sampleRate: 96000,
      bitDepth: 24,
      codec: 'FLAC',
      accurateripConfidence: null,
      tracks: [
        'Velvet Overpass',
        'Harbor Nocturne',
        '114th Street Rain',
        'After Hours Waltz',
      ],
    },
    {
      id: 'alb-tokyo-rain',
      folder: 'Kuroda_Kenji/Tokyo_Rain',
      title: 'Tokyo Rain Architecture',
      artist: 'Kenji Kuroda',
      releaseYear: 1996,
      mediaFormat: 'cd',
      catalogNumber: 'TOCT-9420',
      recordLabel: 'Shibuya Ambient Works',
      pressingNotes: 'Compact disc transfer · 16-bit / 44.1kHz FLAC',
      metadataSource: 'AccurateRip + MusicBrainz',
      needsLinerNotes: 0,
      coverImage: '/src/assets/images/album_cover_tokyo_rain_1794508288637.jpg',
      profile: 'ambient',
      sampleRate: 44100,
      bitDepth: 16,
      codec: 'FLAC',
      accurateripConfidence: 52,
      tracks: [
        'Shinjuku Underpass (02:14)',
        'Glass Canopy',
        'Yamanote Echoes',
        'Dawn Over Sumida',
      ],
    },
    {
      id: 'alb-pacific-drift',
      folder: 'ALS/Pacific_Drift',
      title: 'Pacific Drift',
      artist: 'Analog Latitude',
      releaseYear: 1989,
      mediaFormat: 'cassette',
      catalogNumber: 'CAS-0894',
      recordLabel: 'Cascade Tape Editions',
      pressingNotes: 'Type II · Chrome CrO₂ (70µs), Dolby B · Nakamichi BX-300 · 24-bit / 48kHz WAV',
      metadataSource: 'Cassette Deck Transfer',
      needsLinerNotes: 0,
      coverImage: '/src/assets/images/album_cover_analog_drift_1794508288561.jpg',
      profile: 'tape',
      sampleRate: 48000,
      bitDepth: 24,
      codec: 'WAV',
      accurateripConfidence: null,
      tracks: [
        'Side A: Coastal Fog',
        'Side A: Highway 101 South',
        'Side B: Redwoods at Dusk',
        'Side B: Static Horizon',
      ],
    },
    {
      id: 'alb-harmonies-brass',
      folder: 'David_Chen/Chamber_Works',
      title: 'Chamber Works for Cello & Piano',
      artist: 'David Chen Ensemble',
      releaseYear: 2022,
      mediaFormat: 'digital',
      catalogNumber: 'CW-2022-24',
      recordLabel: 'Meridian Studio Masters',
      pressingNotes: 'Studio master download · 24-bit / 96kHz FLAC',
      metadataSource: 'Studio Master Metadata',
      needsLinerNotes: 0,
      coverImage: '/src/assets/images/album_cover_chamber_works_1794508288941.jpg',
      profile: 'cello',
      sampleRate: 96000,
      bitDepth: 24,
      codec: 'FLAC',
      accurateripConfidence: null,
      tracks: [
        'Prelude in G Minor',
        'Etude for Unaccompanied Cello',
        'Nocturne for Strings & Keys',
      ],
    },
  ];

  const insertAlbum = db.prepare(
    `INSERT INTO albums (
      id, storage_root_id, relative_folder_path, title, artist, release_year,
      media_format, catalog_number, record_label, pressing_notes, metadata_source, needs_liner_notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const insertTrack = db.prepare(
    `INSERT INTO tracks (
      id, album_id, relative_file_path, disc_number, track_number, title, artist,
      duration_ms, sample_rate, bit_depth, codec, accuraterip_confidence, gapless_next_track_id
    ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const insertLiner = db.prepare(
    `INSERT INTO liner_notes (
      id, album_id, page_type, page_order, relative_image_path, extracted_ocr_text, ai_confidence_score
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  for (const rel of sampleReleases) {
    insertAlbum.run(
      rel.id,
      rootId,
      rel.folder,
      rel.title,
      rel.artist,
      rel.releaseYear,
      rel.mediaFormat,
      rel.catalogNumber,
      rel.recordLabel,
      rel.pressingNotes,
      rel.metadataSource,
      rel.needsLinerNotes
    );

    const trackIds = rel.tracks.map((_, idx) => `trk-${rel.id}-${idx + 1}`);
    rel.tracks.forEach((trackTitle, idx) => {
      const fileName = `${String(idx + 1).padStart(2, '0')}_${trackTitle
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')}.wav`;
      const relPath = `${rel.folder}/${fileName}`;
      const durationMs = ensureWavFile(
        path.join(STORAGE_MUSIC_DIR, relPath),
        rel.profile,
        idx + 1,
        14
      );
      insertTrack.run(
        trackIds[idx],
        rel.id,
        relPath,
        idx + 1,
        trackTitle,
        rel.artist,
        durationMs,
        rel.sampleRate,
        rel.bitDepth,
        rel.codec,
        rel.accurateripConfidence,
        idx < trackIds.length - 1 ? trackIds[idx + 1] : null
      );
    });

    insertLiner.run(
      `ln-${rel.id}-cover`,
      rel.id,
      'front_cover',
      1,
      rel.coverImage,
      null,
      null
    );

    if (rel.gatefoldImage) {
      insertLiner.run(
        `ln-${rel.id}-gatefold`,
        rel.id,
        'gatefold',
        2,
        rel.gatefoldImage,
        rel.gatefoldText || null,
        0.96
      );
    }
  }
}

export function resolveValidStorageRootId(requestedId?: string | null): string | null {
  if (requestedId) {
    const existing = db
      .prepare('SELECT id FROM storage_roots WHERE id = ?')
      .get(requestedId) as { id: string } | undefined;
    if (existing) return existing.id;
  }
  const firstOnline = db
    .prepare('SELECT id FROM storage_roots ORDER BY is_online DESC, name ASC LIMIT 1')
    .get() as { id: string } | undefined;
  return firstOnline?.id || null;
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
