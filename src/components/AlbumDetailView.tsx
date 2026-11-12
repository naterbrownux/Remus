import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Check,
  Copy,
  Disc3,
  ExternalLink,
  HardDriveDownload,
  Play,
  Plus,
  ScanText,
  Smartphone,
  Trash2,
  Upload,
} from 'lucide-react';
import type {
  AlbumWithDetails,
  LinerNotePageType,
  PairingInfo,
} from '../../packages/shared/src/types';
import {
  formatDurationMs,
  formatMediaFormatLabel,
  formatPageTypeLabel,
  getAlbumCoverUrl,
} from '../lib/formatters';
import {
  SleeveImageUploader,
  type QueuedSleeveImage,
} from './SleeveImageUploader';

interface AlbumDetailViewProps {
  album: AlbumWithDetails;
  activeTrackId: string | null;
  isPlaying: boolean;
  cachedTrackIds: Set<string>;
  onBack: () => void;
  onPlayAlbum: (album: AlbumWithDetails, startTrackId?: string) => void;
  onCacheOffline: (album: AlbumWithDetails) => Promise<void>;
  onRemoveOfflineCache: (album: AlbumWithDetails) => Promise<void>;
  onRefreshAlbum: () => Promise<void>;
  onDeleted: () => Promise<void>;
  onOpenMobileSync: () => void;
  onOpenMobileScanMode: (albumId: string) => void;
}

export function AlbumDetailView({
  album,
  activeTrackId,
  isPlaying,
  cachedTrackIds,
  onBack,
  onPlayAlbum,
  onCacheOffline,
  onRemoveOfflineCache,
  onRefreshAlbum,
  onDeleted,
  onOpenMobileSync,
  onOpenMobileScanMode,
}: AlbumDetailViewProps) {
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(
    album.liner_notes[0]?.id || null
  );
  const [editingNotes, setEditingNotes] = useState(false);
  const [pressingNotesDraft, setPressingNotesDraft] = useState(album.pressing_notes || '');
  const [savingNotes, setSavingNotes] = useState(false);

  const [ocrLoadingId, setOcrLoadingId] = useState<string | null>(null);
  const [ocrStatusMsg, setOcrStatusMsg] = useState<string | null>(null);

  const [showAddTrack, setShowAddTrack] = useState(false);
  const [newTrackTitle, setNewTrackTitle] = useState('');
  const [newTrackFile, setNewTrackFile] = useState<File | null>(null);
  const [addingTrack, setAddingTrack] = useState(false);

  const [showUploadLiner, setShowUploadLiner] = useState(false);
  const [showMobileScanQr, setShowMobileScanQr] = useState(false);
  const [mobilePairing, setMobilePairing] = useState<PairingInfo | null>(null);
  const [copiedScanLink, setCopiedScanLink] = useState(false);
  const [queuedSleeveImages, setQueuedSleeveImages] = useState<QueuedSleeveImage[]>([]);
  const [autoRunOcr, setAutoRunOcr] = useState(false);
  const [uploadingLiner, setUploadingLiner] = useState(false);
  const [deletingNoteId, setDeletingNoteId] = useState<string | null>(null);

  const [cachingOffline, setCachingOffline] = useState(false);
  const sleeveSectionRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!showMobileScanQr) return;
    fetch(`/api/pairing?albumId=${encodeURIComponent(album.id)}`)
      .then((r) => r.json())
      .then((data: PairingInfo) => setMobilePairing(data))
      .catch(() => {});

    const timer = window.setInterval(() => {
      onRefreshAlbum().catch(() => {});
    }, 3500);
    return () => window.clearInterval(timer);
  }, [album.id, onRefreshAlbum, showMobileScanQr]);

  useEffect(() => {
    return () => {
      for (const item of queuedSleeveImages) {
        URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, []);

  const coverUrl = getAlbumCoverUrl(album);
  const activeNote =
    album.liner_notes.find((n) => n.id === selectedNoteId) || album.liner_notes[0] || null;
  const allTracksCached =
    album.tracks.length > 0 && album.tracks.every((t) => cachedTrackIds.has(t.id));

  function openSleeveUploader() {
    setShowUploadLiner(true);
    setTimeout(() => {
      sleeveSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 40);
  }

  function handleAddSleeveFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;

    const alreadyHasFront =
      album.liner_notes.some((ln) => ln.page_type === 'front_cover') ||
      queuedSleeveImages.some((q) => q.pageType === 'front_cover');

    setQueuedSleeveImages((prev) => {
      const next: QueuedSleeveImage[] = files.map((file, idx) => {
        const lowerName = file.name.toLowerCase();
        let defaultType: LinerNotePageType = 'gatefold';
        if (lowerName.includes('front') || lowerName.includes('cover')) {
          defaultType = 'front_cover';
        } else if (lowerName.includes('back')) {
          defaultType = 'back_cover';
        } else if (lowerName.includes('gatefold')) {
          defaultType = 'gatefold';
        } else if (lowerName.includes('jcard') || lowerName.includes('j-card')) {
          defaultType = 'j_card';
        } else if (lowerName.includes('booklet') || lowerName.includes('insert')) {
          defaultType = 'booklet';
        } else if (!alreadyHasFront && idx === 0) {
          defaultType = 'front_cover';
        }
        return {
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          file,
          previewUrl: URL.createObjectURL(file),
          pageType: defaultType,
        };
      });
      return [...prev, ...next];
    });
  }

  function handleUpdateSleevePageType(id: string, pageType: LinerNotePageType) {
    setQueuedSleeveImages((prev) =>
      prev.map((item) => (item.id === id ? { ...item, pageType } : item))
    );
  }

  function handleRemoveQueuedSleeve(id: string) {
    setQueuedSleeveImages((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  }

  async function handleSavePressingNotes() {
    setSavingNotes(true);
    try {
      await fetch(`/api/albums/${album.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pressing_notes: pressingNotesDraft }),
      });
      await onRefreshAlbum();
      setEditingNotes(false);
    } finally {
      setSavingNotes(false);
    }
  }

  async function handleRunOcr(noteId: string) {
    setOcrLoadingId(noteId);
    setOcrStatusMsg(null);
    try {
      const res = await fetch(`/api/liner-notes/${noteId}/ocr`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gemini Vision OCR failed.');
      }
      await onRefreshAlbum();
      setOcrStatusMsg('Liner note transcription updated via Gemini Vision.');
    } catch (err) {
      setOcrStatusMsg(err instanceof Error ? err.message : 'OCR request failed.');
    } finally {
      setOcrLoadingId(null);
    }
  }

  async function handleUploadLiner(e: FormEvent) {
    e.preventDefault();
    if (queuedSleeveImages.length === 0) return;
    setUploadingLiner(true);
    setOcrStatusMsg(null);
    try {
      let lastUploadedId: string | null = null;
      const ocrNotes: string[] = [];

      for (const item of queuedSleeveImages) {
        const formData = new FormData();
        formData.append('image', item.file);
        formData.append('page_type', item.pageType);
        formData.append('run_ocr', autoRunOcr ? 'true' : 'false');

        const res = await fetch(`/api/albums/${album.id}/liner-notes`, {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || `Upload failed for ${item.file.name}.`);
        }
        if (data.linerNoteId) {
          lastUploadedId = data.linerNoteId;
        }
        if (data.ocrError) {
          ocrNotes.push(data.ocrError);
        }
      }

      for (const item of queuedSleeveImages) {
        URL.revokeObjectURL(item.previewUrl);
      }

      const uploadedCount = queuedSleeveImages.length;
      setQueuedSleeveImages([]);
      await onRefreshAlbum();
      if (lastUploadedId) {
        setSelectedNoteId(lastUploadedId);
      }
      setShowUploadLiner(false);
      setOcrStatusMsg(
        ocrNotes.length > 0
          ? `Uploaded ${uploadedCount} image${uploadedCount > 1 ? 's' : ''}. OCR note: ${ocrNotes[0]}`
          : `Uploaded ${uploadedCount} sleeve/gatefold image${uploadedCount > 1 ? 's' : ''}.`
      );
    } catch (err) {
      setOcrStatusMsg(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setUploadingLiner(false);
    }
  }

  async function handleDeleteLinerNote(noteId: string) {
    setDeletingNoteId(noteId);
    setOcrStatusMsg(null);
    try {
      const res = await fetch(`/api/liner-notes/${noteId}`, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Failed to remove scan.');
      }
      await onRefreshAlbum();
      if (selectedNoteId === noteId) {
        const remaining = album.liner_notes.filter((n) => n.id !== noteId);
        setSelectedNoteId(remaining[0]?.id || null);
      }
    } catch (err) {
      setOcrStatusMsg(err instanceof Error ? err.message : 'Unable to delete scan.');
    } finally {
      setDeletingNoteId(null);
    }
  }

  async function handleAddTrack(e: FormEvent) {
    e.preventDefault();
    if (!newTrackTitle.trim()) return;
    setAddingTrack(true);
    try {
      const formData = new FormData();
      formData.append('title', newTrackTitle.trim());
      if (newTrackFile) {
        formData.append('audio', newTrackFile);
      }
      await fetch(`/api/albums/${album.id}/tracks`, {
        method: 'POST',
        body: formData,
      });
      setNewTrackTitle('');
      setNewTrackFile(null);
      setShowAddTrack(false);
      await onRefreshAlbum();
    } finally {
      setAddingTrack(false);
    }
  }

  async function handleDeleteAlbum() {
    await fetch(`/api/albums/${album.id}`, { method: 'DELETE' });
    await onDeleted();
  }

  return (
    <div className="space-y-8">
      {/* Top Action Strip */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-[#9E9B93] hover:text-[#F2EFE9] transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Library</span>
        </button>

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={cachingOffline}
            onClick={async () => {
              setCachingOffline(true);
              try {
                if (allTracksCached) {
                  await onRemoveOfflineCache(album);
                } else {
                  await onCacheOffline(album);
                }
              } finally {
                setCachingOffline(false);
              }
            }}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg border border-[#2A2A27] text-xs font-medium text-[#F2EFE9] hover:bg-[#22221F] transition-colors cursor-pointer whitespace-nowrap"
          >
            {allTracksCached ? (
              <>
                <Check className="w-3.5 h-3.5 text-[#E06D2B]" />
                <span>Cached Offline</span>
              </>
            ) : (
              <>
                <HardDriveDownload className="w-3.5 h-3.5" />
                <span>{cachingOffline ? 'Caching...' : 'Cache Offline'}</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleDeleteAlbum}
            aria-label="Delete release"
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#2A2A27] text-xs font-medium text-[#9E9B93] hover:text-[#FCA5A5] hover:border-[#DC2626]/40 transition-colors cursor-pointer whitespace-nowrap"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Remove</span>
          </button>
        </div>
      </div>

      {/* Hero Release Header */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch pb-8 border-b border-[#2A2A27]">
        <div className="lg:col-span-4 space-y-2.5">
          <div className="aspect-square w-full max-w-sm rounded-xl overflow-hidden bg-[#1A1A18] border border-[#2A2A27] flex items-center justify-center">
            {coverUrl ? (
              <img
                src={coverUrl}
                alt={album.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="flex flex-col items-center gap-3 text-[#706D66] p-6 text-center">
                <Disc3 className="w-12 h-12" />
                <span className="text-xs font-medium text-[#9E9B93]">{album.title}</span>
                <button
                  type="button"
                  onClick={openSleeveUploader}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#22221F] hover:bg-[#2C2C28] border border-[#2A2A27] text-xs font-medium text-[#F2EFE9] cursor-pointer whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5 text-[#E06D2B]" />
                  <span>Upload Sleeve / Gatefold</span>
                </button>
              </div>
            )}
          </div>
          {coverUrl && (
            <button
              type="button"
              onClick={openSleeveUploader}
              className="inline-flex items-center gap-1.5 text-xs text-[#9E9B93] hover:text-[#E06D2B] transition-colors cursor-pointer"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>Upload Sleeve / Gatefold Image</span>
            </button>
          )}
        </div>

        <div className="lg:col-span-8 flex flex-col justify-between space-y-5">
          <div className="space-y-3">
            <div className="text-xs text-[#9E9B93] flex flex-wrap items-center gap-2">
              <span>{formatMediaFormatLabel(album.media_format)}</span>
              {album.release_year && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">{album.release_year}</span>
                </>
              )}
              {album.record_label && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{album.record_label}</span>
                </>
              )}
              {album.catalog_number && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">{album.catalog_number}</span>
                </>
              )}
            </div>

            <h1 className="text-3xl md:text-4xl font-semibold text-[#F2EFE9] tracking-tight text-balance">
              {album.title}
            </h1>
            <p className="text-lg text-[#C9C5BC]">{album.artist}</p>

            {/* Pressing & Transfer Notes */}
            <div className="pt-2">
              {editingNotes ? (
                <div className="space-y-2">
                  <textarea
                    rows={3}
                    value={pressingNotesDraft}
                    onChange={(e) => setPressingNotesDraft(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#1A1A18] border border-[#2A2A27] text-sm text-[#F2EFE9] focus:outline-none focus:border-[#E06D2B]"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={savingNotes}
                      onClick={handleSavePressingNotes}
                      className="px-3 py-1.5 rounded-md bg-[#E06D2B] text-xs font-semibold text-[#121211] cursor-pointer"
                    >
                      {savingNotes ? 'Saving...' : 'Save Notes'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingNotes(false)}
                      className="px-3 py-1.5 rounded-md border border-[#2A2A27] text-xs text-[#9E9B93] cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-start justify-between gap-4">
                  <p className="text-sm text-[#9E9B93] leading-relaxed max-w-2xl">
                    {album.pressing_notes || 'No pressing or mastering notes recorded yet.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      setPressingNotesDraft(album.pressing_notes || '');
                      setEditingNotes(true);
                    }}
                    className="text-xs text-[#E06D2B] hover:underline shrink-0 cursor-pointer"
                  >
                    Edit notes
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-[#2A2A27]">
            <div className="flex flex-wrap items-center gap-5 text-xs text-[#9E9B93] tabular-nums">
              <div>
                <span className="text-[#706D66] block">Volume</span>
                <span className="text-[#F2EFE9] font-medium">
                  {album.storage_root_name || 'Unassigned'}
                </span>
              </div>
              <div>
                <span className="text-[#706D66] block">Folder Path</span>
                <span className="font-mono text-[#C9C5BC]">{album.relative_folder_path}</span>
              </div>
              <div>
                <span className="text-[#706D66] block">Metadata Source</span>
                <span className="text-[#F2EFE9]">{album.metadata_source || 'Manual'}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onPlayAlbum(album)}
              disabled={album.tracks.length === 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#E06D2B] hover:bg-[#EB7B3B] text-sm font-semibold text-[#121211] transition-colors cursor-pointer disabled:opacity-40 whitespace-nowrap"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Play Release</span>
            </button>
          </div>
        </div>
      </section>

      {/* Tracklist Table */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[#F2EFE9]">
            Tracklist ({album.tracks.length})
          </h2>
          <button
            type="button"
            onClick={() => setShowAddTrack(!showAddTrack)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#2A2A27] text-xs font-medium text-[#F2EFE9] hover:bg-[#1A1A18] transition-colors cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Track</span>
          </button>
        </div>

        {showAddTrack && (
          <form
            onSubmit={handleAddTrack}
            className="p-4 rounded-xl bg-[#1A1A18] border border-[#2A2A27] grid grid-cols-1 md:grid-cols-3 gap-3 items-end"
          >
            <div>
              <label className="block text-xs text-[#9E9B93] mb-1">Track Title</label>
              <input
                type="text"
                required
                value={newTrackTitle}
                onChange={(e) => setNewTrackTitle(e.target.value)}
                placeholder="e.g. Encore Take 2"
                className="w-full px-3 py-2 rounded-lg bg-[#121211] border border-[#2A2A27] text-sm text-[#F2EFE9] focus:outline-none focus:border-[#E06D2B]"
              />
            </div>
            <div>
              <label className="block text-xs text-[#9E9B93] mb-1">
                Audio File (optional WAV/FLAC/MP3)
              </label>
              <input
                type="file"
                accept="audio/*"
                onChange={(e) => setNewTrackFile(e.target.files?.[0] || null)}
                className="w-full text-xs text-[#9E9B93] file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-[#2A2A27] file:text-[#F2EFE9] file:cursor-pointer"
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={addingTrack}
                className="px-4 py-2 rounded-lg bg-[#E06D2B] text-xs font-semibold text-[#121211] cursor-pointer whitespace-nowrap"
              >
                {addingTrack ? 'Adding...' : 'Save Track'}
              </button>
              <button
                type="button"
                onClick={() => setShowAddTrack(false)}
                className="px-3 py-2 rounded-lg border border-[#2A2A27] text-xs text-[#9E9B93] cursor-pointer"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        <div className="rounded-xl border border-[#2A2A27] overflow-hidden bg-[#161614]">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[#2A2A27] text-xs text-[#706D66]">
                  <th className="py-3 px-4 font-medium w-12">#</th>
                  <th className="py-3 px-4 font-medium">Title</th>
                  <th className="py-3 px-4 font-medium">Album Title</th>
                  <th className="py-3 px-4 font-medium">Year</th>
                  <th className="py-3 px-4 font-medium text-right">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#232320] text-sm">
                {album.tracks.map((track) => {
                  const isCurrent = activeTrackId === track.id;
                  const isCached = cachedTrackIds.has(track.id);
                  return (
                    <tr
                      key={track.id}
                      onClick={() => onPlayAlbum(album, track.id)}
                      className={`h-11 cursor-pointer transition-colors ${
                        isCurrent ? 'bg-[#E06D2B]/10' : 'hover:bg-[#1E1E1B]'
                      }`}
                    >
                      <td className="px-4 font-mono text-xs text-[#9E9B93] tabular-nums">
                        {isCurrent && isPlaying ? (
                          <span className="text-[#E06D2B] font-semibold">▶</span>
                        ) : (
                          String(track.track_number).padStart(2, '0')
                        )}
                      </td>
                      <td className="px-4">
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-medium ${
                              isCurrent ? 'text-[#E06D2B]' : 'text-[#F2EFE9]'
                            }`}
                          >
                            {track.title}
                          </span>
                          {isCached && (
                            <HardDriveDownload
                              className="w-3.5 h-3.5 text-[#E06D2B] shrink-0"
                              aria-label="Cached offline"
                            />
                          )}
                        </div>
                      </td>
                      <td className="px-4 text-xs text-[#C9C5BC]">
                        {album.title}
                      </td>
                      <td className="px-4 font-mono text-xs text-[#9E9B93] tabular-nums whitespace-nowrap">
                        {album.release_year ?? '—'}
                      </td>
                      <td className="px-4 font-mono text-xs text-[#9E9B93] text-right tabular-nums">
                        {formatDurationMs(track.duration_ms)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Sleeve, Gatefold & Liner Notes Archive */}
      <section ref={sleeveSectionRef} className="space-y-4 pt-4 border-t border-[#2A2A27]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[#F2EFE9]">
              Sleeve, Gatefold & Liner Scans
            </h2>
            <p className="text-xs text-[#9E9B93]">
              Upload front/back sleeve artwork, gatefold spreads, and booklet scans with optional Gemini Vision OCR
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => setShowMobileScanQr(!showMobileScanQr)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                showMobileScanQr
                  ? 'border-[#E06D2B]/50 bg-[#E06D2B]/10 text-[#E06D2B]'
                  : 'border-[#2A2A27] text-[#F2EFE9] hover:bg-[#1A1A18]'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5 text-[#E06D2B]" />
              <span>Scan via Mobile Sync</span>
            </button>

            <button
              type="button"
              onClick={() => setShowUploadLiner(!showUploadLiner)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#2A2A27] text-xs font-medium text-[#F2EFE9] hover:bg-[#1A1A18] transition-colors cursor-pointer whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5 text-[#E06D2B]" />
              <span>Upload Sleeve / Gatefold</span>
            </button>
          </div>
        </div>

        {showMobileScanQr && (
          <div className="p-4 rounded-xl bg-[#1A1A18] border border-[#2A2A27] flex flex-col sm:flex-row items-center gap-5">
            <div className="w-32 h-32 rounded-xl bg-[#121211] border border-[#2A2A27] p-2.5 shrink-0 flex items-center justify-center">
              {mobilePairing ? (
                <div
                  className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
                  dangerouslySetInnerHTML={{ __html: mobilePairing.scanQrSvg }}
                />
              ) : (
                <span className="text-[11px] text-[#706D66]">Generating QR...</span>
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-2.5">
              <div className="text-sm font-semibold text-[#F2EFE9]">
                Capture Sleeve & Gatefold Photos with Your Phone
              </div>
              <p className="text-xs text-[#9E9B93] leading-relaxed">
                Scan this QR code with your phone camera to photograph sleeve covers or gatefolds for <span className="text-[#F2EFE9] font-medium">{album.title}</span>. Uploaded scans appear here automatically.
              </p>

              <div className="flex flex-wrap items-center gap-2.5 pt-0.5">
                <button
                  type="button"
                  onClick={() => onOpenMobileScanMode(album.id)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#E06D2B] hover:bg-[#EB7B3B] text-xs font-semibold text-[#121211] cursor-pointer whitespace-nowrap"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open Mobile Scan Capture</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!mobilePairing) return;
                    navigator.clipboard?.writeText(mobilePairing.scanUrl);
                    setCopiedScanLink(true);
                    setTimeout(() => setCopiedScanLink(false), 1800);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#2A2A27] text-xs font-medium text-[#F2EFE9] hover:bg-[#22221F] cursor-pointer whitespace-nowrap"
                >
                  {copiedScanLink ? (
                    <Check className="w-3.5 h-3.5 text-[#E06D2B]" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedScanLink ? 'Link Copied' : 'Copy Scan Link'}</span>
                </button>
                <button
                  type="button"
                  onClick={onOpenMobileSync}
                  className="text-xs text-[#9E9B93] hover:text-[#E06D2B] cursor-pointer whitespace-nowrap"
                >
                  Open Mobile Sync Hub
                </button>
              </div>
            </div>
          </div>
        )}

        {ocrStatusMsg && (
          <div className="p-3 rounded-lg bg-[#1A1A18] border border-[#2A2A27] text-xs text-[#C9C5BC]">
            {ocrStatusMsg}
          </div>
        )}

        {showUploadLiner && (
          <form
            onSubmit={handleUploadLiner}
            className="p-4 rounded-xl bg-[#1A1A18] border border-[#2A2A27] space-y-4"
          >
            <SleeveImageUploader
              items={queuedSleeveImages}
              onAddFiles={handleAddSleeveFiles}
              onUpdatePageType={handleUpdateSleevePageType}
              onRemoveItem={handleRemoveQueuedSleeve}
            />

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <label className="flex items-center gap-2 text-xs text-[#C9C5BC] cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoRunOcr}
                  onChange={(e) => setAutoRunOcr(e.target.checked)}
                  className="accent-[#E06D2B]"
                />
                <span>Run Gemini Vision OCR on upload</span>
              </label>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    for (const item of queuedSleeveImages) {
                      URL.revokeObjectURL(item.previewUrl);
                    }
                    setQueuedSleeveImages([]);
                    setShowUploadLiner(false);
                  }}
                  className="px-3 py-2 rounded-lg border border-[#2A2A27] text-xs text-[#9E9B93] hover:text-[#F2EFE9] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={uploadingLiner || queuedSleeveImages.length === 0}
                  className="px-4 py-2 rounded-lg bg-[#E06D2B] hover:bg-[#EB7B3B] text-xs font-semibold text-[#121211] cursor-pointer disabled:opacity-40 whitespace-nowrap"
                >
                  {uploadingLiner
                    ? 'Uploading...'
                    : `Save ${queuedSleeveImages.length || ''} ${queuedSleeveImages.length === 1 ? 'Image' : 'Images'}`}
                </button>
              </div>
            </div>
          </form>
        )}

        {album.liner_notes.length === 0 ? (
          <div className="p-8 rounded-xl border border-[#2A2A27] bg-[#161614] text-center space-y-3">
            <BookOpen className="w-6 h-6 text-[#706D66] mx-auto" />
            <p className="text-sm text-[#9E9B93]">
              No sleeve covers, gatefold spreads, or liner scans attached to this release yet.
            </p>
            <div>
              <button
                type="button"
                onClick={() => setShowUploadLiner(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#E06D2B] hover:bg-[#EB7B3B] text-xs font-semibold text-[#121211] cursor-pointer whitespace-nowrap"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Sleeve / Gatefold</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Page Thumbnails + Large Preview */}
            <div className="lg:col-span-7 space-y-3">
              <div className="flex items-center gap-2 overflow-x-auto pb-1">
                {album.liner_notes.map((note) => (
                  <button
                    key={note.id}
                    type="button"
                    onClick={() => setSelectedNoteId(note.id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      activeNote?.id === note.id
                        ? 'bg-[#E06D2B] text-[#121211]'
                        : 'bg-[#1A1A18] border border-[#2A2A27] text-[#9E9B93] hover:text-[#F2EFE9]'
                    }`}
                  >
                    {note.page_order}. {formatPageTypeLabel(note.page_type)}
                  </button>
                ))}
              </div>

              {activeNote && (
                <div className="rounded-xl overflow-hidden border border-[#2A2A27] bg-[#161614]">
                  <img
                    src={activeNote.relative_image_path}
                    alt={`${album.title} ${activeNote.page_type}`}
                    referrerPolicy="no-referrer"
                    className="w-full max-h-[420px] object-contain bg-[#0E0E0D]"
                  />
                </div>
              )}
            </div>

            {/* Extracted OCR Text */}
            <div className="lg:col-span-5 rounded-xl border border-[#2A2A27] bg-[#161614] p-5 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-[#F2EFE9]">
                    Archival OCR Transcription
                  </h3>
                  <p className="text-xs text-[#9E9B93] tabular-nums">
                    {activeNote?.ai_confidence_score != null
                      ? `Confidence ${Math.round(activeNote.ai_confidence_score * 100)}%`
                      : 'Pending Vision OCR'}
                  </p>
                </div>

                {activeNote && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={ocrLoadingId === activeNote.id}
                      onClick={() => handleRunOcr(activeNote.id)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#22221F] hover:bg-[#2C2C28] border border-[#2A2A27] text-xs font-medium text-[#F2EFE9] cursor-pointer disabled:opacity-50 whitespace-nowrap"
                    >
                      <ScanText className="w-3.5 h-3.5 text-[#E06D2B]" />
                      <span>
                        {ocrLoadingId === activeNote.id ? 'Scanning...' : 'Extract Text'}
                      </span>
                    </button>
                    <button
                      type="button"
                      disabled={deletingNoteId === activeNote.id}
                      onClick={() => handleDeleteLinerNote(activeNote.id)}
                      aria-label="Remove scan"
                      title="Remove scan"
                      className="p-1.5 rounded-lg bg-[#22221F] hover:bg-[#2C2C28] border border-[#2A2A27] text-[#9E9B93] hover:text-[#FCA5A5] cursor-pointer disabled:opacity-50"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              <div className="p-3.5 rounded-lg bg-[#121211] border border-[#232320] text-xs text-[#C9C5BC] leading-relaxed whitespace-pre-wrap min-h-[200px] max-h-[340px] overflow-y-auto font-mono">
                {activeNote?.extracted_ocr_text ||
                  'No transcribed text stored for this page yet. Click Extract Text to run Gemini Vision OCR.'}
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
