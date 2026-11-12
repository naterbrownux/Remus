import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import type { MediaFormat, StorageRoot } from '../../packages/shared/src/types';

interface AddReleaseModalProps {
  storageRoots: StorageRoot[];
  onClose: () => void;
  onCreated: () => Promise<void>;
}

export function AddReleaseModal({
  storageRoots,
  onClose,
  onCreated,
}: AddReleaseModalProps) {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [releaseYear, setReleaseYear] = useState('1974');
  const [mediaFormat, setMediaFormat] = useState<MediaFormat>('vinyl');
  const [storageRootId, setStorageRootId] = useState(
    storageRoots.find((r) => r.is_online === 1)?.id || ''
  );
  const [catalogNumber, setCatalogNumber] = useState('');
  const [recordLabel, setRecordLabel] = useState('');
  const [pressingNotes, setPressingNotes] = useState('');
  const [trackTitlesText, setTrackTitlesText] = useState(
    'Side A1 — Opening Theme\nSide A2 — Late Night Session\nSide B1 — Reprise'
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!title.trim() || !artist.trim()) {
      setError('Album title and artist are required.');
      return;
    }
    setSubmitting(true);
    try {
      const tracks = trackTitlesText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((trackTitle) => ({
          title: trackTitle,
          codec: mediaFormat === 'cd' ? 'FLAC' : 'WAV',
          sample_rate: mediaFormat === 'cd' ? 44100 : 96000,
          bit_depth: mediaFormat === 'cd' ? 16 : 24,
        }));

      const res = await fetch('/api/albums', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storage_root_id: storageRootId || null,
          title,
          artist,
          release_year: releaseYear ? Number(releaseYear) : null,
          media_format: mediaFormat,
          catalog_number: catalogNumber || null,
          record_label: recordLabel || null,
          pressing_notes: pressingNotes || null,
          metadata_source: 'Manual',
          tracks,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add release.');
      }
      await onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save release.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-xl bg-[#1A1A18] border border-[#2A2A27] rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#2A2A27] flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#F2EFE9]">Add Music</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 text-[#9E9B93] hover:text-[#F2EFE9] rounded-md cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          {error && (
            <div className="p-3 rounded-lg bg-[#DC2626]/10 border border-[#DC2626]/30 text-sm text-[#FCA5A5]">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#9E9B93] mb-1.5">
                Release Title
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Night Lights in Osaka"
                className="w-full px-3 py-2 rounded-lg bg-[#121211] border border-[#2A2A27] text-sm text-[#F2EFE9] focus:outline-none focus:border-[#E06D2B]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#9E9B93] mb-1.5">
                Artist
              </label>
              <input
                type="text"
                required
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder="e.g. Hiroshi Sato"
                className="w-full px-3 py-2 rounded-lg bg-[#121211] border border-[#2A2A27] text-sm text-[#F2EFE9] focus:outline-none focus:border-[#E06D2B]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#9E9B93] mb-1.5">
                Physical Format
              </label>
              <select
                value={mediaFormat}
                onChange={(e) => setMediaFormat(e.target.value as MediaFormat)}
                className="w-full px-3 py-2 rounded-lg bg-[#121211] border border-[#2A2A27] text-sm text-[#F2EFE9] focus:outline-none focus:border-[#E06D2B]"
              >
                <option value="vinyl">Vinyl LP</option>
                <option value="cd">Compact Disc</option>
                <option value="cassette">Cassette Tape</option>
                <option value="digital">Digital Master</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#9E9B93] mb-1.5">
                Release Year
              </label>
              <input
                type="number"
                value={releaseYear}
                onChange={(e) => setReleaseYear(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#121211] border border-[#2A2A27] text-sm font-mono text-[#F2EFE9] focus:outline-none focus:border-[#E06D2B]"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-[#9E9B93] mb-1.5">
                Catalog Number
              </label>
              <input
                type="text"
                value={catalogNumber}
                onChange={(e) => setCatalogNumber(e.target.value)}
                placeholder="e.g. ALFA-2801"
                className="w-full px-3 py-2 rounded-lg bg-[#121211] border border-[#2A2A27] text-sm font-mono text-[#F2EFE9] focus:outline-none focus:border-[#E06D2B]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[#9E9B93] mb-1.5">
                Volume
              </label>
              <select
                value={storageRootId}
                onChange={(e) => setStorageRootId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#121211] border border-[#2A2A27] text-sm text-[#F2EFE9] focus:outline-none focus:border-[#E06D2B]"
              >
                {storageRoots.map((root) => (
                  <option key={root.id} value={root.id}>
                    {root.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-[#9E9B93] mb-1.5">
                Record Label
              </label>
              <input
                type="text"
                value={recordLabel}
                onChange={(e) => setRecordLabel(e.target.value)}
                placeholder="e.g. Alfa Records"
                className="w-full px-3 py-2 rounded-lg bg-[#121211] border border-[#2A2A27] text-sm text-[#F2EFE9] focus:outline-none focus:border-[#E06D2B]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#9E9B93] mb-1.5">
              Pressing & Transfer Notes
            </label>
            <input
              type="text"
              value={pressingNotes}
              onChange={(e) => setPressingNotes(e.target.value)}
              placeholder="e.g. 1st Japanese pressing with Obi · 24-bit / 96kHz ADC transfer"
              className="w-full px-3 py-2 rounded-lg bg-[#121211] border border-[#2A2A27] text-sm text-[#F2EFE9] focus:outline-none focus:border-[#E06D2B]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#9E9B93] mb-1.5">
              Tracklist (one title per line)
            </label>
            <textarea
              rows={3}
              value={trackTitlesText}
              onChange={(e) => setTrackTitlesText(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-[#121211] border border-[#2A2A27] text-sm text-[#F2EFE9] focus:outline-none focus:border-[#E06D2B]"
            />
          </div>

          <div className="pt-2 flex items-center justify-end gap-3 border-t border-[#2A2A27]">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg border border-[#2A2A27] text-sm text-[#9E9B93] hover:text-[#F2EFE9] cursor-pointer whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-[#E06D2B] hover:bg-[#EB7B3B] text-sm font-semibold text-[#121211] cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              {submitting ? 'Saving Release...' : 'Save Release'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
