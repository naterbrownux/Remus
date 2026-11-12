import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ArrowLeft,
  Camera,
  Check,
  ImagePlus,
  Smartphone,
  Upload,
} from 'lucide-react';
import type {
  AlbumWithDetails,
  LinerNotePageType,
} from '../../packages/shared/src/types';
import { formatPageTypeLabel } from '../lib/formatters';
import {
  SLEEVE_PAGE_TYPE_OPTIONS,
  type QueuedSleeveImage,
} from './SleeveImageUploader';

interface MobileScanCaptureViewProps {
  albums: AlbumWithDetails[];
  initialAlbumId?: string | null;
  pairingToken?: string | null;
  onUploaded: () => Promise<void>;
  onExitMobileMode: () => void;
}

export function MobileScanCaptureView({
  albums,
  initialAlbumId,
  pairingToken,
  onUploaded,
  onExitMobileMode,
}: MobileScanCaptureViewProps) {
  const [selectedAlbumId, setSelectedAlbumId] = useState<string>(() => {
    if (initialAlbumId && albums.some((a) => a.id === initialAlbumId)) {
      return initialAlbumId;
    }
    return albums[0]?.id || '';
  });
  const [queuedImages, setQueuedImages] = useState<QueuedSleeveImage[]>([]);
  const [autoRunOcr, setAutoRunOcr] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const libraryInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (initialAlbumId && albums.some((a) => a.id === initialAlbumId)) {
      setSelectedAlbumId(initialAlbumId);
    } else if (!selectedAlbumId && albums[0]) {
      setSelectedAlbumId(albums[0].id);
    }
  }, [albums, initialAlbumId, selectedAlbumId]);

  useEffect(() => {
    return () => {
      for (const item of queuedImages) {
        URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, []);

  const targetAlbum = albums.find((a) => a.id === selectedAlbumId) || albums[0] || null;

  function addCapturedFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;

    const alreadyHasFront =
      (targetAlbum?.liner_notes.some((ln) => ln.page_type === 'front_cover') ?? false) ||
      queuedImages.some((q) => q.pageType === 'front_cover');

    setQueuedImages((prev) => [
      ...prev,
      ...files.map((file, idx) => ({
        id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        file,
        previewUrl: URL.createObjectURL(file),
        pageType: (!alreadyHasFront && idx === 0
          ? 'front_cover'
          : 'gatefold') as LinerNotePageType,
      })),
    ]);
    setStatusMessage(null);
    setErrorMessage(null);
  }

  function updatePageType(id: string, pageType: LinerNotePageType) {
    setQueuedImages((prev) =>
      prev.map((item) => (item.id === id ? { ...item, pageType } : item))
    );
  }

  function removeQueued(id: string) {
    setQueuedImages((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  }

  async function handleUpload(e: FormEvent) {
    e.preventDefault();
    if (!targetAlbum || queuedImages.length === 0) return;

    setUploading(true);
    setStatusMessage(null);
    setErrorMessage(null);

    try {
      const ocrWarnings: string[] = [];
      for (const item of queuedImages) {
        const formData = new FormData();
        formData.append('image', item.file);
        formData.append('page_type', item.pageType);
        formData.append('run_ocr', autoRunOcr ? 'true' : 'false');

        const res = await fetch(`/api/albums/${targetAlbum.id}/liner-notes`, {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || `Failed to upload ${item.file.name}`);
        }
        if (data.ocrError) {
          ocrWarnings.push(data.ocrError);
        }
        URL.revokeObjectURL(item.previewUrl);
      }

      const count = queuedImages.length;
      setQueuedImages([]);
      await onUploaded();
      setStatusMessage(
        ocrWarnings.length > 0
          ? `Synced ${count} scan${count > 1 ? 's' : ''} to "${targetAlbum.title}". OCR note: ${ocrWarnings[0]}`
          : `Synced ${count} scan${count > 1 ? 's' : ''} to "${targetAlbum.title}".`
      );
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Mobile scan upload failed.');
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#121211] text-[#F2EFE9] px-4 py-6">
      <div className="max-w-lg mx-auto space-y-6">
        <header className="flex items-center justify-between gap-3 pb-4 border-b border-[#2A2A27]">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-[#E06D2B]/15 border border-[#E06D2B]/30 flex items-center justify-center shrink-0">
              <Smartphone className="w-4 h-4 text-[#E06D2B]" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-[#F2EFE9] truncate">
                Remus Mobile Scan Sync
              </h1>
              <p className="text-xs text-[#9E9B93] truncate font-mono">
                {pairingToken ? `Paired · ${pairingToken}` : 'Direct LAN Camera Upload'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onExitMobileMode}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#2A2A27] bg-[#161614] text-xs font-medium text-[#C9C5BC] hover:text-[#F2EFE9] cursor-pointer whitespace-nowrap"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Desktop View</span>
          </button>
        </header>

        <form onSubmit={handleUpload} className="space-y-5">
          <div className="p-4 rounded-xl bg-[#161614] border border-[#2A2A27] space-y-2">
            <label className="block text-xs font-medium text-[#9E9B93]">
              Target Release
            </label>
            <select
              value={targetAlbum?.id || ''}
              onChange={(e) => setSelectedAlbumId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg bg-[#121211] border border-[#2A2A27] text-sm text-[#F2EFE9] focus:outline-none focus:border-[#E06D2B]"
            >
              {albums.map((album) => (
                <option key={album.id} value={album.id}>
                  {album.title} — {album.artist} ({album.liner_notes.length} scans)
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => {
                addCapturedFiles(e.target.files);
                e.target.value = '';
              }}
              className="hidden"
            />
            <input
              ref={libraryInputRef}
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => {
                addCapturedFiles(e.target.files);
                e.target.value = '';
              }}
              className="hidden"
            />

            <button
              type="button"
              onClick={() => cameraInputRef.current?.click()}
              className="min-h-[52px] px-4 py-3 rounded-xl bg-[#E06D2B] hover:bg-[#EB7B3B] text-sm font-semibold text-[#121211] flex items-center justify-center gap-2 cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              <span>Take Sleeve Photo</span>
            </button>

            <button
              type="button"
              onClick={() => libraryInputRef.current?.click()}
              className="min-h-[52px] px-4 py-3 rounded-xl bg-[#1A1A18] hover:bg-[#22221F] border border-[#2A2A27] text-sm font-medium text-[#F2EFE9] flex items-center justify-center gap-2 cursor-pointer"
            >
              <ImagePlus className="w-4 h-4 text-[#E06D2B]" />
              <span>Choose Photos</span>
            </button>
          </div>

          {queuedImages.length > 0 && (
            <div className="p-4 rounded-xl bg-[#161614] border border-[#2A2A27] space-y-3">
              <div className="text-xs font-medium text-[#9E9B93]">
                Ready to Sync ({queuedImages.length})
              </div>
              <div className="space-y-2.5">
                {queuedImages.map((item) => (
                  <div
                    key={item.id}
                    className="p-2.5 rounded-lg bg-[#121211] border border-[#2A2A27] flex items-center gap-3"
                  >
                    <img
                      src={item.previewUrl}
                      alt={item.file.name}
                      className="w-14 h-14 rounded-md object-cover border border-[#2A2A27] shrink-0"
                    />
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="text-xs font-medium text-[#F2EFE9] truncate">
                        {item.file.name}
                      </div>
                      <select
                        value={item.pageType}
                        onChange={(e) =>
                          updatePageType(item.id, e.target.value as LinerNotePageType)
                        }
                        className="w-full px-2.5 py-1.5 rounded-md bg-[#1A1A18] border border-[#2A2A27] text-xs text-[#F2EFE9]"
                      >
                        {SLEEVE_PAGE_TYPE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeQueued(item.id)}
                      className="px-2 py-1 text-xs text-[#9E9B93] hover:text-[#FCA5A5] cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>

              <label className="flex items-center gap-2 text-xs text-[#C9C5BC] pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoRunOcr}
                  onChange={(e) => setAutoRunOcr(e.target.checked)}
                  className="accent-[#E06D2B]"
                />
                <span>Run Gemini Vision OCR on upload</span>
              </label>

              <button
                type="submit"
                disabled={uploading || !targetAlbum}
                className="w-full min-h-[48px] px-4 py-3 rounded-xl bg-[#E06D2B] hover:bg-[#EB7B3B] text-sm font-semibold text-[#121211] flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Upload className="w-4 h-4" />
                <span>
                  {uploading
                    ? 'Syncing Scans...'
                    : `Sync ${queuedImages.length} Scan${queuedImages.length === 1 ? '' : 's'} to Library`}
                </span>
              </button>
            </div>
          )}

          {statusMessage && (
            <div className="p-3.5 rounded-xl bg-[#E06D2B]/10 border border-[#E06D2B]/30 text-xs text-[#F2EFE9] flex items-center gap-2">
              <Check className="w-4 h-4 text-[#E06D2B] shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-[#DC2626]/10 border border-[#DC2626]/30 text-xs text-[#FCA5A5]">
              {errorMessage}
            </div>
          )}
        </form>

        {targetAlbum && (
          <section className="p-4 rounded-xl bg-[#161614] border border-[#2A2A27] space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#F2EFE9]">
                Synced Scans ({targetAlbum.liner_notes.length})
              </h2>
              <span className="text-xs text-[#9E9B93] truncate max-w-[180px]">
                {targetAlbum.title}
              </span>
            </div>

            {targetAlbum.liner_notes.length === 0 ? (
              <p className="text-xs text-[#706D66]">
                No sleeve or gatefold scans synced for this release yet.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2.5">
                {targetAlbum.liner_notes.map((note) => (
                  <div
                    key={note.id}
                    className="rounded-lg overflow-hidden border border-[#2A2A27] bg-[#121211]"
                  >
                    <img
                      src={note.relative_image_path}
                      alt={note.page_type}
                      className="w-full aspect-square object-cover"
                    />
                    <div className="px-2 py-1 text-[10px] text-[#C9C5BC] truncate">
                      {formatPageTypeLabel(note.page_type)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
