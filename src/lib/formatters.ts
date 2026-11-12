import type { AlbumWithDetails, MediaFormat } from '../../packages/shared/src/types';

export function formatDurationMs(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function formatSeconds(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const mins = Math.floor(sec / 60);
  const secs = Math.floor(sec % 60);
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function formatAudioSpec(
  bitDepth: number | null,
  sampleRate: number | null,
  codec: string | null
): string {
  const parts: string[] = [];
  if (bitDepth && sampleRate) {
    const khz = sampleRate % 1000 === 0 ? `${sampleRate / 1000}kHz` : `${(sampleRate / 1000).toFixed(1)}kHz`;
    parts.push(`${bitDepth}-bit / ${khz}`);
  }
  if (codec) {
    parts.push(codec.toUpperCase());
  }
  return parts.join(' · ') || 'Lossless PCM';
}

export function formatMediaFormatLabel(format: MediaFormat): string {
  switch (format) {
    case 'vinyl':
      return 'Vinyl LP';
    case 'cd':
      return 'Compact Disc';
    case 'cassette':
      return 'Cassette Tape';
    case 'digital':
      return 'Digital Master';
  }
}

export function formatPageTypeLabel(pageType: string): string {
  switch (pageType) {
    case 'front_cover':
      return 'Front Cover';
    case 'back_cover':
      return 'Back Cover';
    case 'gatefold':
      return 'Gatefold Spread';
    case 'booklet':
      return 'Insert Booklet';
    case 'j_card':
      return 'Cassette J-Card';
    default:
      return pageType;
  }
}

export function getAlbumCoverUrl(album: AlbumWithDetails): string | null {
  const preferred =
    album.liner_notes.find((ln) => ln.page_type === 'front_cover') ||
    album.liner_notes.find((ln) => ln.page_type === 'j_card') ||
    album.liner_notes[0];
  return preferred ? preferred.relative_image_path : null;
}
