import { useState } from 'react';
import { CheckCircle2, Play, Plus, Trash2 } from 'lucide-react';
import type { AlbumWithDetails, StorageRoot } from '../../packages/shared/src/types';

interface CdRipperViewProps {
  storageRoots: StorageRoot[];
  onRipped: (album: AlbumWithDetails) => Promise<void>;
}

interface TocTrack {
  title: string;
  durationLabel: string;
  accuraterip_confidence: number;
}

export function CdRipperView({ storageRoots, onRipped }: CdRipperViewProps) {
  const [drive, setDrive] = useState('Matshita DVD-R UJ-8A8 (USB-C)');
  const [targetRootId, setTargetRootId] = useState(
    storageRoots.find((r) => r.default_media_format === 'cd')?.id || storageRoots[0]?.id || ''
  );
  const [codec, setCodec] = useState('FLAC');
  const [title, setTitle] = useState('Late Night Trio in Basel');
  const [artist, setArtist] = useState('Nils Lindqvist Quartet');
  const [releaseYear, setReleaseYear] = useState('2004');
  const [catalogNumber, setCatalogNumber] = useState('ECM-1892');
  const [recordLabel, setRecordLabel] = useState('Nordic Resonance Records');
  const [tocTracks, setTocTracks] = useState<TocTrack[]>([
    { title: 'Glacier Glass', durationLabel: '05:18', accuraterip_confidence: 52 },
    { title: 'Basler Münster at Dusk', durationLabel: '06:44', accuraterip_confidence: 52 },
    { title: 'Rhine Ferry Nocturne', durationLabel: '04:51', accuraterip_confidence: 49 },
    { title: 'Coda for Felt Piano', durationLabel: '03:37', accuraterip_confidence: 51 },
  ]);

  const [ripping, setRipping] = useState(false);
  const [activeTrackIdx, setActiveTrackIdx] = useState<number>(-1);
  const [completedTracks, setCompletedTracks] = useState<number[]>([]);
  const [rippedAlbum, setRippedAlbum] = useState<AlbumWithDetails | null>(null);

  function addTocTrack() {
    setTocTracks((prev) => [
      ...prev,
      {
        title: `Track ${prev.length + 1}`,
        durationLabel: '04:12',
        accuraterip_confidence: 44,
      },
    ]);
  }

  async function startSecureRip() {
    if (!title.trim() || !artist.trim() || tocTracks.length === 0) return;
    setRipping(true);
    setRippedAlbum(null);
    setCompletedTracks([]);

    for (let i = 0; i < tocTracks.length; i++) {
      setActiveTrackIdx(i);
      await new Promise((r) => setTimeout(r, 320));
      setCompletedTracks((prev) => [...prev, i]);
    }
    setActiveTrackIdx(-1);

    try {
      const res = await fetch('/api/ripper/rip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storage_root_id: targetRootId,
          title,
          artist,
          release_year: Number(releaseYear) || 2024,
          catalog_number: catalogNumber,
          record_label: recordLabel,
          codec,
          tracks: tocTracks.map((t) => ({
            title: t.title,
            accuraterip_confidence: t.accuraterip_confidence,
          })),
        }),
      });
      if (res.ok) {
        const created = (await res.json()) as AlbumWithDetails;
        setRippedAlbum(created);
        await onRipped(created);
      }
    } finally {
      setRipping(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#F2EFE9]">CD Ripper</h1>
        </div>

        <button
          type="button"
          disabled={ripping}
          onClick={startSecureRip}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#E06D2B] hover:bg-[#EB7B3B] text-sm font-semibold text-[#121211] transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
        >
          <Play className="w-4 h-4 fill-current" />
          <span>{ripping ? 'Extracting Disc...' : 'Start Rip'}</span>
        </button>
      </div>

      {/* Drive & Disc Metadata */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 p-5 rounded-xl bg-[#161614] border border-[#2A2A27] space-y-4">
          <div className="space-y-3">
            <div>
              <label className="block text-xs text-[#9E9B93] mb-1">Optical Drive</label>
              <select
                value={drive}
                onChange={(e) => setDrive(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#121211] border border-[#2A2A27] text-sm text-[#F2EFE9]"
              >
                <option>Matshita DVD-R UJ-8A8 (USB-C)</option>
                <option>Pioneer BDR-XD08UMB-S (PureRead 4+)</option>
                <option>Apple USB SuperDrive (ATAPI)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#9E9B93] mb-1">Target Volume</label>
                <select
                  value={targetRootId}
                  onChange={(e) => setTargetRootId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#121211] border border-[#2A2A27] text-sm text-[#F2EFE9]"
                >
                  {storageRoots.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#9E9B93] mb-1">Lossless Codec</label>
                <select
                  value={codec}
                  onChange={(e) => setCodec(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#121211] border border-[#2A2A27] text-sm font-mono text-[#F2EFE9]"
                >
                  <option value="FLAC">FLAC (16/44.1)</option>
                  <option value="ALAC">ALAC (16/44.1)</option>
                  <option value="WAV">WAV PCM (16/44.1)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-[#9E9B93] mb-1">Album Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#121211] border border-[#2A2A27] text-sm text-[#F2EFE9]"
              />
            </div>

            <div>
              <label className="block text-xs text-[#9E9B93] mb-1">Artist</label>
              <input
                type="text"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-[#121211] border border-[#2A2A27] text-sm text-[#F2EFE9]"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-[#9E9B93] mb-1">Year</label>
                <input
                  type="number"
                  value={releaseYear}
                  onChange={(e) => setReleaseYear(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#121211] border border-[#2A2A27] text-sm font-mono text-[#F2EFE9]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#9E9B93] mb-1">Catalog #</label>
                <input
                  type="text"
                  value={catalogNumber}
                  onChange={(e) => setCatalogNumber(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#121211] border border-[#2A2A27] text-sm font-mono text-[#F2EFE9]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#9E9B93] mb-1">Label</label>
                <input
                  type="text"
                  value={recordLabel}
                  onChange={(e) => setRecordLabel(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#121211] border border-[#2A2A27] text-sm text-[#F2EFE9]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Disc TOC Table */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-xl border border-[#2A2A27] bg-[#161614] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#2A2A27] flex items-center justify-between">
              <span className="text-sm font-semibold text-[#F2EFE9]">
                Disc Table of Contents ({tocTracks.length} Tracks)
              </span>
              <button
                type="button"
                onClick={addTocTrack}
                className="inline-flex items-center gap-1 text-xs text-[#E06D2B] hover:underline cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Track</span>
              </button>
            </div>

            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#2A2A27] text-xs text-[#706D66]">
                  <th className="py-2.5 px-4 font-medium w-10">#</th>
                  <th className="py-2.5 px-4 font-medium">Track Title</th>
                  <th className="py-2.5 px-4 font-medium">AccurateRip</th>
                  <th className="py-2.5 px-4 font-medium">Status</th>
                  <th className="py-2.5 px-4 font-medium text-right">Remove</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#232320] text-sm">
                {tocTracks.map((tr, idx) => {
                  const done = completedTracks.includes(idx);
                  const active = activeTrackIdx === idx;
                  return (
                    <tr key={idx} className="h-11">
                      <td className="px-4 font-mono text-xs text-[#9E9B93] tabular-nums">
                        {String(idx + 1).padStart(2, '0')}
                      </td>
                      <td className="px-4">
                        <input
                          type="text"
                          value={tr.title}
                          onChange={(e) => {
                            const val = e.target.value;
                            setTocTracks((prev) =>
                              prev.map((item, i) => (i === idx ? { ...item, title: val } : item))
                            );
                          }}
                          className="w-full bg-transparent text-sm text-[#F2EFE9] focus:outline-none border-b border-transparent focus:border-[#E06D2B]"
                        />
                      </td>
                      <td className="px-4 font-mono text-xs text-[#9E9B93] tabular-nums">
                        AR v2 ({tr.accuraterip_confidence})
                      </td>
                      <td className="px-4 text-xs font-mono">
                        {done ? (
                          <span className="text-[#4ADE80]">Verified {codec}</span>
                        ) : active ? (
                          <span className="text-[#E06D2B]">Reading sectors...</span>
                        ) : (
                          <span className="text-[#706D66]">Queued</span>
                        )}
                      </td>
                      <td className="px-4 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            setTocTracks((prev) => prev.filter((_, i) => i !== idx))
                          }
                          aria-label="Remove TOC track"
                          className="p-1 text-[#706D66] hover:text-[#FCA5A5] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {rippedAlbum && (
            <div className="p-4 rounded-xl bg-[#1A1A18] border border-[#E06D2B]/40 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-[#E06D2B] shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-[#F2EFE9]">
                    {rippedAlbum.title} added to your Remus Library
                  </div>
                  <div className="text-xs text-[#9E9B93]">
                    {rippedAlbum.tracks.length} lossless tracks written to disk and indexed in SQLite.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
