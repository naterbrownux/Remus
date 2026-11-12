import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import multer from 'multer';
import QRCode from 'qrcode';
import { createServer as createViteServer } from 'vite';
import { ensureWavFile, type SoundProfile } from './server/audio.ts';
import {
  db,
  getAlbumById,
  getAllAlbumsWithDetails,
  getAllStorageRoots,
  seedInitialLibrary,
  STORAGE_LINER_DIR,
  STORAGE_MUSIC_DIR,
} from './server/db.ts';
import { extractLinerNotesWithGemini } from './server/gemini.ts';

seedInitialLibrary();

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = process.cwd();

app.use(express.json({ limit: '15mb' }));

// Static mounts for generated/uploaded media & generated artwork
app.use('/storage', express.static(path.join(ROOT_DIR, 'storage')));
app.use(
  '/src/assets/images',
  express.static(path.join(ROOT_DIR, 'src', 'assets', 'images'))
);

const uploadLiner = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, STORAGE_LINER_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg';
      cb(null, `liner_${Date.now()}_${crypto.randomBytes(3).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
});

const uploadAudio = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, STORAGE_MUSIC_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || '.wav';
      cb(null, `upload_${Date.now()}_${crypto.randomBytes(3).toString('hex')}${ext}`);
    },
  }),
  limits: { fileSize: 80 * 1024 * 1024 },
});

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'remus-local-server', port: PORT });
});

// ---------------- Storage Roots ----------------
app.get('/api/storage-roots', (_req, res) => {
  res.json(getAllStorageRoots());
});

app.post('/api/storage-roots', (req, res) => {
  const { name, provider_type, base_uri, default_media_format, is_online } = req.body;
  if (!name || !provider_type || !base_uri) {
    res.status(400).json({ error: 'name, provider_type, and base_uri are required.' });
    return;
  }
  const id = `root-${crypto.randomBytes(4).toString('hex')}`;
  db.prepare(
    `INSERT INTO storage_roots (id, name, provider_type, base_uri, default_media_format, is_online)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    String(name).trim(),
    provider_type,
    String(base_uri).trim(),
    default_media_format || null,
    is_online === 0 ? 0 : 1
  );
  const created = db.prepare('SELECT * FROM storage_roots WHERE id = ?').get(id);
  res.status(201).json(created);
});

app.patch('/api/storage-roots/:id', (req, res) => {
  const { id } = req.params;
  const existing = db.prepare('SELECT * FROM storage_roots WHERE id = ?').get(id);
  if (!existing) {
    res.status(404).json({ error: 'Volume not found.' });
    return;
  }
  const { is_online, name, base_uri } = req.body;
  if (typeof is_online === 'number') {
    db.prepare('UPDATE storage_roots SET is_online = ? WHERE id = ?').run(is_online ? 1 : 0, id);
  }
  if (typeof name === 'string' && name.trim()) {
    db.prepare('UPDATE storage_roots SET name = ? WHERE id = ?').run(name.trim(), id);
  }
  if (typeof base_uri === 'string' && base_uri.trim()) {
    db.prepare('UPDATE storage_roots SET base_uri = ? WHERE id = ?').run(base_uri.trim(), id);
  }
  res.json(db.prepare('SELECT * FROM storage_roots WHERE id = ?').get(id));
});

app.delete('/api/storage-roots/:id', (req, res) => {
  const { id } = req.params;
  db.prepare('UPDATE albums SET storage_root_id = NULL WHERE storage_root_id = ?').run(id);
  db.prepare('DELETE FROM storage_roots WHERE id = ?').run(id);
  res.json({ deleted: true, id });
});

app.get('/api/storage-roots/:id/browse', (req, res) => {
  const { id } = req.params;
  const relSubpath = String(req.query.path || '')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\.\./g, '');

  const root = db.prepare('SELECT * FROM storage_roots WHERE id = ?').get(id) as
    | {
        id: string;
        name: string;
        provider_type: string;
        base_uri: string;
        default_media_format: string | null;
        is_online: number;
      }
    | undefined;

  if (!root) {
    res.status(404).json({ error: 'Volume not found.' });
    return;
  }

  if (root.is_online === 0) {
    res.json({
      root,
      currentPath: relSubpath,
      entries: [],
      offline: true,
    });
    return;
  }

  const albums = getAllAlbumsWithDetails().filter((a) => a.storage_root_id === id);

  interface BrowseEntry {
    name: string;
    path: string;
    kind: 'folder' | 'audio' | 'image';
    sizeBytes: number | null;
    modifiedAt: string | null;
    albumId: string | null;
    albumTitle: string | null;
    trackId: string | null;
    spec: string | null;
    pageType: string | null;
    previewUrl: string | null;
    itemCount?: number;
  }

  const folderMap = new Map<string, BrowseEntry>();
  const files: BrowseEntry[] = [];

  for (const album of albums) {
    const folderNorm = album.relative_folder_path.replace(/^\/+|\/+$/g, '');

    if (!relSubpath) {
      const topSegment = folderNorm.split('/')[0];
      if (topSegment) {
        const existing = folderMap.get(topSegment);
        const isExactAlbum = folderNorm === topSegment;
        if (existing) {
          existing.itemCount = (existing.itemCount || 0) + album.tracks.length;
        } else {
          folderMap.set(topSegment, {
            name: topSegment,
            path: topSegment,
            kind: 'folder',
            sizeBytes: null,
            modifiedAt: album.created_at,
            albumId: isExactAlbum ? album.id : null,
            albumTitle: isExactAlbum ? album.title : null,
            trackId: null,
            spec: isExactAlbum ? album.media_format.toUpperCase() : 'Artist Folder',
            pageType: null,
            previewUrl: null,
            itemCount: album.tracks.length,
          });
        }
      }
    } else if (folderNorm === relSubpath) {
      // Inside the album folder: list tracks and liner note scans
      for (const track of album.tracks) {
        const fullAudioPath = path.join(STORAGE_MUSIC_DIR, track.relative_file_path);
        let sizeBytes: number | null = null;
        let modifiedAt: string | null = album.created_at;
        if (fs.existsSync(fullAudioPath)) {
          const st = fs.statSync(fullAudioPath);
          sizeBytes = st.size;
          modifiedAt = st.mtime.toISOString();
        }
        const khz = track.sample_rate
          ? track.sample_rate % 1000 === 0
            ? `${track.sample_rate / 1000}kHz`
            : `${(track.sample_rate / 1000).toFixed(1)}kHz`
          : '44.1kHz';

        files.push({
          name: path.basename(track.relative_file_path),
          path: `${folderNorm}/${path.basename(track.relative_file_path)}`,
          kind: 'audio',
          sizeBytes,
          modifiedAt,
          albumId: album.id,
          albumTitle: album.title,
          trackId: track.id,
          spec: `${track.bit_depth || 16}-bit / ${khz} · ${track.codec || 'WAV'}`,
          pageType: null,
          previewUrl: `/api/stream/${track.id}`,
        });
      }

      for (const note of album.liner_notes) {
        const relDisk = note.relative_image_path.replace(/^\/+/, '');
        const fullImgPath = path.join(ROOT_DIR, relDisk);
        let sizeBytes: number | null = null;
        let modifiedAt: string | null = album.created_at;
        if (fs.existsSync(fullImgPath)) {
          const st = fs.statSync(fullImgPath);
          sizeBytes = st.size;
          modifiedAt = st.mtime.toISOString();
        }
        files.push({
          name: path.basename(note.relative_image_path),
          path: `${folderNorm}/${path.basename(note.relative_image_path)}`,
          kind: 'image',
          sizeBytes,
          modifiedAt,
          albumId: album.id,
          albumTitle: album.title,
          trackId: null,
          spec: note.page_type,
          pageType: note.page_type,
          previewUrl: note.relative_image_path,
        });
      }
    } else if (folderNorm.startsWith(`${relSubpath}/`)) {
      const rest = folderNorm.slice(relSubpath.length + 1);
      const nextSegment = rest.split('/')[0];
      const nextPath = `${relSubpath}/${nextSegment}`;
      const isExactAlbum = folderNorm === nextPath;
      if (!folderMap.has(nextSegment)) {
        folderMap.set(nextSegment, {
          name: nextSegment,
          path: nextPath,
          kind: 'folder',
          sizeBytes: null,
          modifiedAt: album.created_at,
          albumId: isExactAlbum ? album.id : null,
          albumTitle: isExactAlbum ? album.title : null,
          trackId: null,
          spec: isExactAlbum ? `${album.media_format.toUpperCase()} Release` : 'Folder',
          pageType: null,
          previewUrl: null,
          itemCount: album.tracks.length + album.liner_notes.length,
        });
      }
    }
  }

  const entries = [
    ...Array.from(folderMap.values()).sort((a, b) => a.name.localeCompare(b.name)),
    ...files,
  ];

  res.json({
    root,
    currentPath: relSubpath,
    entries,
    offline: false,
  });
});

// ---------------- Albums ----------------
app.get('/api/albums', (_req, res) => {
  res.json(getAllAlbumsWithDetails());
});

app.get('/api/albums/:id', (req, res) => {
  const album = getAlbumById(req.params.id);
  if (!album) {
    res.status(404).json({ error: 'Album not found.' });
    return;
  }
  res.json(album);
});

app.post('/api/albums', (req, res) => {
  const {
    storage_root_id,
    title,
    artist,
    release_year,
    media_format,
    catalog_number,
    record_label,
    pressing_notes,
    metadata_source,
    tracks,
  } = req.body;

  if (!title || !artist || !media_format) {
    res.status(400).json({ error: 'title, artist, and media_format are required.' });
    return;
  }

  const albumId = `alb-${crypto.randomBytes(4).toString('hex')}`;
  const safeFolder = `${String(artist).replace(/[^a-z0-9]/gi, '_')}/${String(title).replace(/[^a-z0-9]/gi, '_')}`;

  db.prepare(
    `INSERT INTO albums (
      id, storage_root_id, relative_folder_path, title, artist, release_year,
      media_format, catalog_number, record_label, pressing_notes, metadata_source, needs_liner_notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`
  ).run(
    albumId,
    storage_root_id || null,
    safeFolder,
    String(title).trim(),
    String(artist).trim(),
    release_year ? Number(release_year) : null,
    media_format,
    catalog_number ? String(catalog_number).trim() : null,
    record_label ? String(record_label).trim() : null,
    pressing_notes ? String(pressing_notes).trim() : null,
    metadata_source || 'Manual'
  );

  const trackList: Array<{ title: string; codec?: string; sample_rate?: number; bit_depth?: number }> =
    Array.isArray(tracks) && tracks.length > 0
      ? tracks
      : [{ title: `${String(title).trim()} — Side A1`, codec: 'FLAC', sample_rate: 96000, bit_depth: 24 }];

  const profile: SoundProfile =
    media_format === 'vinyl'
      ? 'jazz'
      : media_format === 'cassette'
        ? 'tape'
        : media_format === 'cd'
          ? 'piano'
          : 'ambient';

  const trackIds = trackList.map(() => `trk-${crypto.randomBytes(4).toString('hex')}`);
  const insertTrack = db.prepare(
    `INSERT INTO tracks (
      id, album_id, relative_file_path, disc_number, track_number, title, artist,
      duration_ms, sample_rate, bit_depth, codec, accuraterip_confidence, gapless_next_track_id
    ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  trackList.forEach((t, idx) => {
    const fileName = `${String(idx + 1).padStart(2, '0')}_${crypto.randomBytes(3).toString('hex')}.wav`;
    const relPath = `${safeFolder}/${fileName}`;
    const durationMs = ensureWavFile(path.join(STORAGE_MUSIC_DIR, relPath), profile, idx + 1, 14);
    insertTrack.run(
      trackIds[idx],
      albumId,
      relPath,
      idx + 1,
      String(t.title || `Track ${idx + 1}`).trim(),
      String(artist).trim(),
      durationMs,
      t.sample_rate || (media_format === 'cd' ? 44100 : 96000),
      t.bit_depth || (media_format === 'cd' ? 16 : 24),
      t.codec || 'FLAC',
      media_format === 'cd' ? 38 : null,
      idx < trackIds.length - 1 ? trackIds[idx + 1] : null
    );
  });

  res.status(201).json(getAlbumById(albumId));
});

app.patch('/api/albums/:id', (req, res) => {
  const { id } = req.params;
  const existing = getAlbumById(id);
  if (!existing) {
    res.status(404).json({ error: 'Album not found.' });
    return;
  }
  const { pressing_notes, catalog_number, record_label, needs_liner_notes } = req.body;
  db.prepare(
    `UPDATE albums
     SET pressing_notes = COALESCE(?, pressing_notes),
         catalog_number = COALESCE(?, catalog_number),
         record_label = COALESCE(?, record_label),
         needs_liner_notes = COALESCE(?, needs_liner_notes)
     WHERE id = ?`
  ).run(
    pressing_notes ?? null,
    catalog_number ?? null,
    record_label ?? null,
    typeof needs_liner_notes === 'number' ? needs_liner_notes : null,
    id
  );
  res.json(getAlbumById(id));
});

app.delete('/api/albums/:id', (req, res) => {
  db.prepare('DELETE FROM albums WHERE id = ?').run(req.params.id);
  res.json({ deleted: true, id: req.params.id });
});

// ---------------- Tracks & Upload ----------------
app.post('/api/albums/:id/tracks', uploadAudio.single('audio'), (req, res) => {
  const album = getAlbumById(req.params.id);
  if (!album) {
    res.status(404).json({ error: 'Album not found.' });
    return;
  }

  const nextTrackNum = album.tracks.length + 1;
  const title = (req.body.title && String(req.body.title).trim()) || `Track ${nextTrackNum}`;
  const sampleRate = Number(req.body.sample_rate) || 44100;
  const bitDepth = Number(req.body.bit_depth) || 16;
  const codec = (req.body.codec && String(req.body.codec)) || (req.file ? path.extname(req.file.originalname).replace('.', '').toUpperCase() || 'WAV' : 'WAV');

  let relPath: string;
  let durationMs = Number(req.body.duration_ms) || 14000;

  if (req.file) {
    relPath = path.basename(req.file.path);
  } else {
    relPath = `${album.relative_folder_path}/${String(nextTrackNum).padStart(2, '0')}_${crypto.randomBytes(3).toString('hex')}.wav`;
    durationMs = ensureWavFile(path.join(STORAGE_MUSIC_DIR, relPath), 'piano', nextTrackNum, 14);
  }

  const trackId = `trk-${crypto.randomBytes(4).toString('hex')}`;

  // Link previous last track's gapless_next_track_id to this new track
  if (album.tracks.length > 0) {
    const prevLast = album.tracks[album.tracks.length - 1];
    db.prepare('UPDATE tracks SET gapless_next_track_id = ? WHERE id = ?').run(trackId, prevLast.id);
  }

  db.prepare(
    `INSERT INTO tracks (
      id, album_id, relative_file_path, disc_number, track_number, title, artist,
      duration_ms, sample_rate, bit_depth, codec, accuraterip_confidence, gapless_next_track_id
    ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`
  ).run(trackId, album.id, relPath, nextTrackNum, title, album.artist, durationMs, sampleRate, bitDepth, codec);

  res.status(201).json(getAlbumById(album.id));
});

// ---------------- Liner Notes & Gemini Vision OCR ----------------
app.post('/api/albums/:id/liner-notes', uploadLiner.single('image'), async (req, res) => {
  const album = getAlbumById(req.params.id);
  if (!album) {
    res.status(404).json({ error: 'Album not found.' });
    return;
  }

  const pageType = req.body.page_type || 'booklet';
  const runOcr = req.body.run_ocr === 'true' || req.body.run_ocr === true;
  const relImgPath = req.file
    ? `/storage/liner_notes/${path.basename(req.file.path)}`
    : req.body.relative_image_path;

  if (!relImgPath) {
    res.status(400).json({ error: 'An image file upload or relative_image_path is required.' });
    return;
  }

  let extractedText: string | null = req.body.extracted_ocr_text || null;
  let confidence: number | null = null;
  let ocrError: string | null = null;

  if (runOcr) {
    try {
      const result = await extractLinerNotesWithGemini(relImgPath, pageType);
      extractedText = result.extractedText;
      confidence = result.confidenceScore;
    } catch (err) {
      ocrError = err instanceof Error ? err.message : 'OCR processing failed.';
    }
  }

  const linerId = `ln-${crypto.randomBytes(4).toString('hex')}`;
  const pageOrder = album.liner_notes.length + 1;

  db.prepare(
    `INSERT INTO liner_notes (
      id, album_id, page_type, page_order, relative_image_path, extracted_ocr_text, ai_confidence_score
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(linerId, album.id, pageType, pageOrder, relImgPath, extractedText, confidence);

  db.prepare('UPDATE albums SET needs_liner_notes = 0 WHERE id = ?').run(album.id);

  res.status(201).json({
    album: getAlbumById(album.id),
    linerNoteId: linerId,
    ocrError,
  });
});

app.post('/api/liner-notes/:id/ocr', async (req, res) => {
  const note = db.prepare('SELECT * FROM liner_notes WHERE id = ?').get(req.params.id) as
    | {
        id: string;
        album_id: string;
        page_type: string;
        relative_image_path: string;
      }
    | undefined;

  if (!note) {
    res.status(404).json({ error: 'Liner note not found.' });
    return;
  }

  try {
    const result = await extractLinerNotesWithGemini(note.relative_image_path, note.page_type);
    db.prepare(
      'UPDATE liner_notes SET extracted_ocr_text = ?, ai_confidence_score = ? WHERE id = ?'
    ).run(result.extractedText, result.confidenceScore, note.id);

    res.json({
      linerNote: db.prepare('SELECT * FROM liner_notes WHERE id = ?').get(note.id),
      extracted: result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Gemini Vision OCR failed.';
    res.status(502).json({ error: message });
  }
});

// ---------------- HTTP 206 Range Audio Streaming ----------------
app.get('/api/stream/:trackId', (req, res) => {
  const track = db
    .prepare('SELECT * FROM tracks WHERE id = ?')
    .get(req.params.trackId) as
    | {
        id: string;
        title: string;
        track_number: number;
        relative_file_path: string;
        codec: string | null;
        sample_rate: number | null;
        bit_depth: number | null;
      }
    | undefined;

  if (!track) {
    res.status(404).json({ error: 'Track not found.' });
    return;
  }

  const fullPath = path.join(STORAGE_MUSIC_DIR, track.relative_file_path);
  if (!fs.existsSync(fullPath)) {
    res.status(404).json({ error: 'Audio file missing on local volume.' });
    return;
  }

  const stat = fs.statSync(fullPath);
  const fileSize = stat.size;
  const ext = path.extname(fullPath).toLowerCase();
  const contentType =
    ext === '.mp3'
      ? 'audio/mpeg'
      : ext === '.ogg'
        ? 'audio/ogg'
        : ext === '.flac'
          ? 'audio/flac'
          : 'audio/wav';

  const range = req.headers.range;
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', contentType);
  res.setHeader('X-Remus-Codec', track.codec || 'WAV');
  res.setHeader('X-Remus-Sample-Rate', String(track.sample_rate || 44100));

  if (req.query.download === '1') {
    const safeTitle = `${String(track.track_number).padStart(2, '0')} - ${track.title}`.replace(
      /[^a-z0-9._ -]/gi,
      '_'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${safeTitle}${ext || '.wav'}"`);
  }

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? Math.min(parseInt(parts[1], 10), fileSize - 1) : fileSize - 1;

    if (Number.isNaN(start) || start >= fileSize || start > end) {
      res.status(416).setHeader('Content-Range', `bytes */${fileSize}`).end();
      return;
    }

    const chunkSize = end - start + 1;
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    res.setHeader('Content-Length', chunkSize);
    fs.createReadStream(fullPath, { start, end }).pipe(res);
  } else {
    res.status(200);
    res.setHeader('Content-Length', fileSize);
    fs.createReadStream(fullPath).pipe(res);
  }
});

// ---------------- Optical CD Ripper Endpoint ----------------
app.post('/api/ripper/rip', (req, res) => {
  const {
    storage_root_id,
    title,
    artist,
    release_year,
    catalog_number,
    record_label,
    codec,
    tracks,
  } = req.body;

  if (!title || !artist || !Array.isArray(tracks) || tracks.length === 0) {
    res.status(400).json({ error: 'title, artist, and at least one track are required.' });
    return;
  }

  const albumId = `alb-rip-${crypto.randomBytes(3).toString('hex')}`;
  const safeFolder = `${String(artist).replace(/[^a-z0-9]/gi, '_')}/${String(title).replace(/[^a-z0-9]/gi, '_')}`;

  db.prepare(
    `INSERT INTO albums (
      id, storage_root_id, relative_folder_path, title, artist, release_year,
      media_format, catalog_number, record_label, pressing_notes, metadata_source, needs_liner_notes
    ) VALUES (?, ?, ?, ?, ?, ?, 'cd', ?, ?, ?, 'AccurateRip + MusicBrainz', 1)`
  ).run(
    albumId,
    storage_root_id || 'root-cd-nas',
    safeFolder,
    String(title).trim(),
    String(artist).trim(),
    release_year ? Number(release_year) : new Date().getFullYear(),
    catalog_number || `CD-${crypto.randomBytes(2).toString('hex').toUpperCase()}`,
    record_label || 'Independent Compact Disc',
    `Ripped securely via Remus Optical Drive Engine · Offset +667 samples · AccurateRip v2 verified.`
  );

  const trackIds = tracks.map(() => `trk-${crypto.randomBytes(4).toString('hex')}`);
  const insertTrack = db.prepare(
    `INSERT INTO tracks (
      id, album_id, relative_file_path, disc_number, track_number, title, artist,
      duration_ms, sample_rate, bit_depth, codec, accuraterip_confidence, gapless_next_track_id
    ) VALUES (?, ?, ?, 1, ?, ?, ?, ?, 44100, 16, ?, ?, ?)`
  );

  tracks.forEach((tr: { title: string; accuraterip_confidence?: number }, idx: number) => {
    const fileName = `${String(idx + 1).padStart(2, '0')}_ripped.wav`;
    const relPath = `${safeFolder}/${fileName}`;
    const durationMs = ensureWavFile(path.join(STORAGE_MUSIC_DIR, relPath), 'piano', idx + 1, 14);
    insertTrack.run(
      trackIds[idx],
      albumId,
      relPath,
      idx + 1,
      String(tr.title || `Track ${idx + 1}`).trim(),
      String(artist).trim(),
      durationMs,
      codec || 'FLAC',
      tr.accuraterip_confidence ?? 48,
      idx < trackIds.length - 1 ? trackIds[idx + 1] : null
    );
  });

  res.status(201).json(getAlbumById(albumId));
});

// ---------------- Local Wi-Fi Pairing & QR Code ----------------
app.get('/api/pairing', async (req, res) => {
  const hostHeader = req.headers.host || `localhost:${PORT}`;
  const protocol = req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
  const hostUrl = process.env.APP_URL && process.env.APP_URL !== 'MY_APP_URL'
    ? process.env.APP_URL
    : `${protocol}://${hostHeader}`;

  const interfaces = os.networkInterfaces();
  let lanIp = '192.168.1.42';
  for (const list of Object.values(interfaces)) {
    if (!list) continue;
    for (const iface of list) {
      if (iface.family === 'IPv4' && !iface.internal) {
        lanIp = iface.address;
        break;
      }
    }
  }

  const pairingToken = crypto.createHash('sha256').update(hostUrl).digest('hex').slice(0, 12).toUpperCase();
  const payload = {
    app: 'remus',
    version: 1,
    hostUrl,
    lanAddress: `http://${lanIp}:${PORT}`,
    mdnsService: '_remus._tcp.local.',
    token: pairingToken,
  };
  const payloadJson = JSON.stringify(payload);
  const qrSvg = await QRCode.toString(payloadJson, {
    type: 'svg',
    margin: 1,
    color: {
      dark: '#F2EFE9',
      light: '#1A1A18',
    },
  });

  res.json({
    serverName: 'Remus Studio Host',
    hostUrl,
    localIpHint: `${lanIp}:${PORT}`,
    mdnsService: '_remus._tcp.local.',
    pairingToken,
    qrSvg,
    payloadJson,
  });
});

// ---------------- Monorepo Inspector Endpoint ----------------
app.get('/api/monorepo', (_req, res) => {
  const files: Array<{ path: string; category: string; language: string; content: string }> = [];
  const candidates = [
    { path: 'packages/shared/schema.sql', category: 'shared', language: 'sql' },
    { path: 'packages/shared/src/types.ts', category: 'shared', language: 'typescript' },
    { path: 'apps/desktop/package.json', category: 'desktop', language: 'json' },
    { path: 'apps/desktop/src-tauri/Cargo.toml', category: 'desktop', language: 'toml' },
    { path: 'apps/desktop/src-tauri/src/main.rs', category: 'desktop', language: 'rust' },
    { path: 'apps/mobile/package.json', category: 'mobile', language: 'json' },
    { path: 'apps/mobile/app.json', category: 'mobile', language: 'json' },
    { path: 'apps/mobile/src/App.tsx', category: 'mobile', language: 'tsx' },
  ];

  for (const c of candidates) {
    const abs = path.join(ROOT_DIR, c.path);
    if (fs.existsSync(abs)) {
      files.push({
        ...c,
        content: fs.readFileSync(abs, 'utf-8'),
      });
    }
  }

  res.json({ files });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(ROOT_DIR, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(ROOT_DIR, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Remus server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
