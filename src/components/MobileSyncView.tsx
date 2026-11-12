import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  Camera,
  Check,
  Copy,
  ExternalLink,
  HardDriveDownload,
  ImagePlus,
  Play,
  QrCode,
  RefreshCw,
  Smartphone,
  Trash2,
  Upload,
  Wifi,
} from 'lucide-react';
import type {
  AlbumWithDetails,
  LinerNotePageType,
  PairingInfo,
} from '../../packages/shared/src/types';
import { formatAudioSpec, formatPageTypeLabel, getAlbumCoverUrl } from '../lib/formatters';
import {
  SLEEVE_PAGE_TYPE_OPTIONS,
  type QueuedSleeveImage,
} from './SleeveImageUploader';

interface MobileSyncViewProps {
  albums: AlbumWithDetails[];
  cachedTrackIds: Set<string>;
  onPlayAlbum: (album: AlbumWithDetails, startTrackId?: string) => void;
  onCacheOffline: (album: AlbumWithDetails) => Promise<void>;
  onRemoveOfflineCache: (album: AlbumWithDetails) => Promise<void>;
  onRefreshCatalog: () => Promise<void>;
  onOpenMobileScanMode: (albumId?: string) => void;
}

export function MobileSyncView({
  albums,
  cachedTrackIds,
  onPlayAlbum,
  onCacheOffline,
  onRemoveOfflineCache,
  onRefreshCatalog,
  onOpenMobileScanMode,
}: MobileSyncViewProps) {
  const [pairing, setPairing] = useState<PairingInfo | null>(null);
  const [qrMode, setQrMode] = useState<'scan' | 'app'>('scan');
  const [qrAlbumId, setQrAlbumId] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [rangeProbeResult, setRangeProbeResult] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);
  const [busyAlbumId, setBusyAlbumId] = useState<string | null>(null);

  // Mobile companion preview tab & scan uploader state
  const [phoneTab, setPhoneTab] = useState<'library' | 'scan'>('library');
  const [scanAlbumId, setScanAlbumId] = useState<string>(albums[0]?.id || '');
  const [queuedScans, setQueuedScans] = useState<QueuedSleeveImage[]>([]);
  const [autoRunOcr, setAutoRunOcr] = useState(false);
  const [uploadingScans, setUploadingScans] = useState(false);
  const [scanFeedback, setScanFeedback] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [syncingNow, setSyncingNow] = useState(false);

  const phoneCameraRef = useRef<HTMLInputElement | null>(null);
  const phoneGalleryRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const query = qrAlbumId ? `?albumId=${encodeURIComponent(qrAlbumId)}` : '';
    fetch(`/api/pairing${query}`)
      .then((r) => r.json())
      .then((data: PairingInfo) => setPairing(data))
      .catch(() => {});
  }, [qrAlbumId]);

  useEffect(() => {
    if (!scanAlbumId && albums[0]) {
      setScanAlbumId(albums[0].id);
    }
  }, [albums, scanAlbumId]);

  // Poll catalog gently while QR scan mode is active so phone camera uploads appear live
  useEffect(() => {
    if (qrMode !== 'scan') return;
    const timer = window.setInterval(() => {
      onRefreshCatalog().catch(() => {});
    }, 4000);
    return () => window.clearInterval(timer);
  }, [onRefreshCatalog, qrMode]);

  useEffect(() => {
    return () => {
      for (const item of queuedScans) {
        URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, []);

  const selectedScanAlbum =
    albums.find((a) => a.id === scanAlbumId) || albums[0] || null;

  async function probeHttpRangeStream() {
    const firstTrack = albums[0]?.tracks[0];
    if (!firstTrack) return;
    setProbing(true);
    try {
      const res = await fetch(`/api/stream/${firstTrack.id}`, {
        headers: { Range: 'bytes=0-65535' },
      });
      const contentRange = res.headers.get('Content-Range') || 'none';
      const codec = res.headers.get('X-Remus-Codec') || 'WAV';
      setRangeProbeResult(
        `HTTP ${res.status} · Content-Range: ${contentRange} · Codec: ${codec}`
      );
    } finally {
      setProbing(false);
    }
  }

  function handleAddPhoneScanFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return;
    const files = Array.from(fileList).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;

    const alreadyHasFront =
      (selectedScanAlbum?.liner_notes.some((ln) => ln.page_type === 'front_cover') ?? false) ||
      queuedScans.some((q) => q.pageType === 'front_cover');

    setQueuedScans((prev) => [
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
    setScanFeedback(null);
    setScanError(null);
  }

  function handleUpdateScanPageType(id: string, pageType: LinerNotePageType) {
    setQueuedScans((prev) =>
      prev.map((item) => (item.id === id ? { ...item, pageType } : item))
    );
  }

  function handleRemoveQueuedScan(id: string) {
    setQueuedScans((prev) => {
      const target = prev.find((i) => i.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  }

  async function handleUploadMobileScans(e: FormEvent) {
    e.preventDefault();
    if (!selectedScanAlbum || queuedScans.length === 0) return;
    setUploadingScans(true);
    setScanFeedback(null);
    setScanError(null);

    try {
      const ocrNotes: string[] = [];
      for (const item of queuedScans) {
        const formData = new FormData();
        formData.append('image', item.file);
        formData.append('page_type', item.pageType);
        formData.append('run_ocr', autoRunOcr ? 'true' : 'false');

        const res = await fetch(`/api/albums/${selectedScanAlbum.id}/liner-notes`, {
          method: 'POST',
          body: formData,
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || `Upload failed for ${item.file.name}`);
        }
        if (data.ocrError) {
          ocrNotes.push(data.ocrError);
        }
        URL.revokeObjectURL(item.previewUrl);
      }

      const uploadedCount = queuedScans.length;
      setQueuedScans([]);
      await onRefreshCatalog();
      setScanFeedback(
        ocrNotes.length > 0
          ? `Uploaded ${uploadedCount} scan${uploadedCount > 1 ? 's' : ''}. OCR note: ${ocrNotes[0]}`
          : `Synced ${uploadedCount} scan${uploadedCount > 1 ? 's' : ''} to ${selectedScanAlbum.title}.`
      );
    } catch (err) {
      setScanError(err instanceof Error ? err.message : 'Mobile scan upload failed.');
    } finally {
      setUploadingScans(false);
    }
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#F2EFE9]">
            Local Wi-Fi Pairing & Mobile Scan Sync
          </h1>
          <p className="text-sm text-[#9E9B93]">
            Pair your phone via QR code to photograph sleeve covers & gatefolds straight into your library, stream lossless audio, and manage offline cache
          </p>
        </div>

        <button
          type="button"
          onClick={async () => {
            setSyncingNow(true);
            try {
              await onRefreshCatalog();
            } finally {
              setSyncingNow(false);
            }
          }}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#2A2A27] bg-[#161614] hover:bg-[#1E1E1B] text-xs font-medium text-[#F2EFE9] cursor-pointer whitespace-nowrap"
        >
          <RefreshCw className={`w-3.5 h-3.5 text-[#E06D2B] ${syncingNow ? 'animate-spin' : ''}`} />
          <span>{syncingNow ? 'Syncing...' : 'Refresh Sync'}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Pairing QR & LAN Range Verification */}
        <div className="lg:col-span-7 space-y-6">
          <div className="p-6 rounded-xl bg-[#161614] border border-[#2A2A27] space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-[#121211] border border-[#2A2A27]">
                <button
                  type="button"
                  onClick={() => setQrMode('scan')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    qrMode === 'scan'
                      ? 'bg-[#262623] text-[#F2EFE9]'
                      : 'text-[#9E9B93] hover:text-[#F2EFE9]'
                  }`}
                >
                  <Camera className="w-3.5 h-3.5 text-[#E06D2B]" />
                  <span>Phone Scan Upload QR</span>
                </button>
                <button
                  type="button"
                  onClick={() => setQrMode('app')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    qrMode === 'app'
                      ? 'bg-[#262623] text-[#F2EFE9]'
                      : 'text-[#9E9B93] hover:text-[#F2EFE9]'
                  }`}
                >
                  <QrCode className="w-3.5 h-3.5 text-[#E06D2B]" />
                  <span>Pair Mobile App</span>
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs text-[#E06D2B] font-medium">
                <Wifi className="w-4 h-4" />
                <span>mDNS Broadcast Active</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-6">
              <div className="w-44 h-44 rounded-xl bg-[#1A1A18] border border-[#2A2A27] p-3 shrink-0 flex items-center justify-center">
                {pairing ? (
                  <div
                    className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
                    dangerouslySetInnerHTML={{
                      __html: qrMode === 'scan' ? pairing.scanQrSvg : pairing.qrSvg,
                    }}
                  />
                ) : (
                  <span className="text-xs text-[#706D66]">Generating QR...</span>
                )}
              </div>

              <div className="space-y-3 min-w-0 flex-1 w-full">
                {qrMode === 'scan' ? (
                  <>
                    <h2 className="text-lg font-semibold text-[#F2EFE9]">
                      Scan Sleeve & Gatefold from Phone
                    </h2>
                    <p className="text-xs text-[#9E9B93] leading-relaxed">
                      Point your phone camera at this QR code to open the Mobile Scan Capture screen, photograph vinyl sleeves or gatefolds, and sync them straight into your library.
                    </p>

                    <div>
                      <label className="block text-[11px] font-medium text-[#9E9B93] mb-1">
                        Pre-select Release (optional)
                      </label>
                      <select
                        value={qrAlbumId}
                        onChange={(e) => setQrAlbumId(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg bg-[#121211] border border-[#2A2A27] text-xs text-[#F2EFE9] focus:outline-none focus:border-[#E06D2B]"
                      >
                        <option value="">Choose on phone (all releases)</option>
                        {albums.map((album) => (
                          <option key={album.id} value={album.id}>
                            {album.title} — {album.artist}
                          </option>
                        ))}
                      </select>
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="text-lg font-semibold text-[#F2EFE9]">
                      Pair Remus Expo Mobile App
                    </h2>
                    <p className="text-xs text-[#9E9B93] leading-relaxed">
                      Open the Remus mobile client on the same Wi-Fi network and scan this QR code to sync your SQLite catalog, capture liner scans, and stream lossless audio via HTTP Range requests.
                    </p>
                  </>
                )}

                {pairing && (
                  <div className="pt-1 space-y-1 text-xs font-mono">
                    <div className="text-[#C9C5BC] truncate">
                      Service: {pairing.mdnsService}
                    </div>
                    <div className="text-[#C9C5BC] truncate">
                      LAN Endpoint: {pairing.localIpHint}
                    </div>
                    <div className="text-[#9E9B93]">Token: {pairing.pairingToken}</div>
                  </div>
                )}

                <div className="pt-1 flex flex-wrap items-center gap-2.5">
                  {qrMode === 'scan' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => onOpenMobileScanMode(qrAlbumId || undefined)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#E06D2B] hover:bg-[#EB7B3B] text-xs font-semibold text-[#121211] cursor-pointer whitespace-nowrap"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Open Scan Capture</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (!pairing) return;
                          navigator.clipboard?.writeText(pairing.scanUrl);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 1800);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#2A2A27] text-xs font-medium text-[#F2EFE9] hover:bg-[#22221F] cursor-pointer whitespace-nowrap"
                      >
                        {copied ? (
                          <Check className="w-3.5 h-3.5 text-[#E06D2B]" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{copied ? 'Scan Link Copied' : 'Copy Scan Link'}</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          if (!pairing) return;
                          navigator.clipboard?.writeText(pairing.payloadJson);
                          setCopied(true);
                          setTimeout(() => setCopied(false), 1800);
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#2A2A27] text-xs font-medium text-[#F2EFE9] hover:bg-[#22221F] cursor-pointer whitespace-nowrap"
                      >
                        {copied ? (
                          <Check className="w-3.5 h-3.5 text-[#E06D2B]" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                        <span>{copied ? 'Payload Copied' : 'Copy Pairing JSON'}</span>
                      </button>

                      <button
                        type="button"
                        disabled={probing}
                        onClick={probeHttpRangeStream}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#22221F] hover:bg-[#2C2C28] border border-[#2A2A27] text-xs font-medium text-[#F2EFE9] cursor-pointer whitespace-nowrap"
                      >
                        <span>{probing ? 'Testing Range...' : 'Verify HTTP 206 Range'}</span>
                      </button>
                    </>
                  )}
                </div>

                {rangeProbeResult && qrMode === 'app' && (
                  <div className="p-2.5 rounded-lg bg-[#121211] border border-[#2A2A27] font-mono text-[11px] text-[#4ADE80] break-all">
                    {rangeProbeResult}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Local Browser Offline Cache Manager */}
          <div className="rounded-xl border border-[#2A2A27] bg-[#161614] overflow-hidden">
            <div className="px-5 py-4 border-b border-[#2A2A27] flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-[#F2EFE9]">
                  Device Offline Cache Manager
                </h3>
                <p className="text-xs text-[#9E9B93]">
                  Tracks pinned locally in Browser CacheStorage ({cachedTrackIds.size} tracks cached)
                </p>
              </div>
            </div>

            <div className="divide-y divide-[#232320]">
              {albums.map((album) => {
                const isCached =
                  album.tracks.length > 0 &&
                  album.tracks.every((t) => cachedTrackIds.has(t.id));
                const busy = busyAlbumId === album.id;
                return (
                  <div
                    key={album.id}
                    className="px-5 py-3.5 flex items-center justify-between gap-4"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-[#F2EFE9] truncate">
                        {album.title}
                      </div>
                      <div className="text-xs text-[#9E9B93] tabular-nums">
                        {album.artist} · {album.tracks.length} tracks · {album.liner_notes.length}{' '}
                        {album.liner_notes.length === 1 ? 'scan' : 'scans'}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={busy || album.tracks.length === 0}
                      onClick={async () => {
                        setBusyAlbumId(album.id);
                        try {
                          if (isCached) {
                            await onRemoveOfflineCache(album);
                          } else {
                            await onCacheOffline(album);
                          }
                        } finally {
                          setBusyAlbumId(null);
                        }
                      }}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer whitespace-nowrap ${
                        isCached
                          ? 'border border-[#2A2A27] text-[#9E9B93] hover:text-[#FCA5A5]'
                          : 'bg-[#22221F] border border-[#2A2A27] text-[#F2EFE9] hover:bg-[#2B2B27]'
                      }`}
                    >
                      {isCached ? (
                        <>
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>{busy ? 'Clearing...' : 'Evict Cache'}</span>
                        </>
                      ) : (
                        <>
                          <HardDriveDownload className="w-3.5 h-3.5 text-[#E06D2B]" />
                          <span>{busy ? 'Downloading...' : 'Pin Offline'}</span>
                        </>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right: Interactive Mobile Client Companion */}
        <div className="lg:col-span-5 flex justify-center">
          <div className="w-full max-w-[360px] rounded-[28px] border border-[#2A2A27] bg-[#121211] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#2A2A27] flex items-center justify-between bg-[#161614]">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-[#E06D2B]" />
                <span className="text-sm font-semibold text-[#F2EFE9]">Remus Mobile</span>
              </div>
              <div className="inline-flex items-center gap-1 p-0.5 rounded-lg bg-[#121211] border border-[#2A2A27]">
                <button
                  type="button"
                  onClick={() => setPhoneTab('library')}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer ${
                    phoneTab === 'library'
                      ? 'bg-[#262623] text-[#F2EFE9]'
                      : 'text-[#9E9B93] hover:text-[#F2EFE9]'
                  }`}
                >
                  Library
                </button>
                <button
                  type="button"
                  onClick={() => setPhoneTab('scan')}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium cursor-pointer ${
                    phoneTab === 'scan'
                      ? 'bg-[#262623] text-[#F2EFE9]'
                      : 'text-[#9E9B93] hover:text-[#F2EFE9]'
                  }`}
                >
                  <Camera className="w-3 h-3 text-[#E06D2B]" />
                  <span>Upload Scan</span>
                </button>
              </div>
            </div>

            {phoneTab === 'library' ? (
              <div className="p-4 space-y-3 max-h-[520px] overflow-y-auto">
                {albums.map((album) => {
                  const cover = getAlbumCoverUrl(album);
                  const firstTrack = album.tracks[0];
                  const isCached =
                    album.tracks.length > 0 &&
                    album.tracks.every((t) => cachedTrackIds.has(t.id));
                  return (
                    <div
                      key={album.id}
                      className="p-3 rounded-2xl bg-[#1A1A18] border border-[#2A2A27] space-y-2.5"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-lg overflow-hidden bg-[#22221F] shrink-0">
                          {cover && (
                            <img
                              src={cover}
                              alt={album.title}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-[#F2EFE9] truncate">
                            {album.title}
                          </div>
                          <div className="text-xs text-[#9E9B93] truncate tabular-nums">
                            {album.artist} · {isCached ? 'Offline' : 'LAN Stream'} ·{' '}
                            {album.liner_notes.length}{' '}
                            {album.liner_notes.length === 1 ? 'scan' : 'scans'}
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setScanAlbumId(album.id);
                              setPhoneTab('scan');
                            }}
                            aria-label={`Upload scan for ${album.title}`}
                            title="Upload sleeve or gatefold scan"
                            className="w-9 h-9 rounded-full bg-[#22221F] hover:bg-[#2C2C28] border border-[#2A2A27] text-[#F2EFE9] flex items-center justify-center cursor-pointer"
                          >
                            <Camera className="w-4 h-4 text-[#E06D2B]" />
                          </button>

                          {firstTrack && (
                            <button
                              type="button"
                              onClick={() => onPlayAlbum(album, firstTrack.id)}
                              aria-label={`Play ${album.title} from mobile preview`}
                              className="w-9 h-9 rounded-full bg-[#E06D2B] text-[#121211] flex items-center justify-center cursor-pointer"
                            >
                              <Play className="w-4 h-4 fill-current ml-0.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {firstTrack && (
                        <div className="text-[11px] font-mono text-[#706D66] flex items-center justify-between pt-1 border-t border-[#232320]">
                          <span className="truncate">{firstTrack.title}</span>
                          <span className="shrink-0 ml-2">
                            {formatAudioSpec(
                              firstTrack.bit_depth,
                              firstTrack.sample_rate,
                              firstTrack.codec
                            )}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <form
                onSubmit={handleUploadMobileScans}
                className="p-4 space-y-3.5 max-h-[520px] overflow-y-auto"
              >
                <div>
                  <label className="block text-[11px] font-medium text-[#9E9B93] mb-1">
                    Release
                  </label>
                  <select
                    value={selectedScanAlbum?.id || ''}
                    onChange={(e) => setScanAlbumId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-[#1A1A18] border border-[#2A2A27] text-xs text-[#F2EFE9] focus:outline-none focus:border-[#E06D2B]"
                  >
                    {albums.map((album) => (
                      <option key={album.id} value={album.id}>
                        {album.title} — {album.artist}
                      </option>
                    ))}
                  </select>
                </div>

                <input
                  ref={phoneCameraRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={(e) => {
                    handleAddPhoneScanFiles(e.target.files);
                    e.target.value = '';
                  }}
                  className="hidden"
                />
                <input
                  ref={phoneGalleryRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={(e) => {
                    handleAddPhoneScanFiles(e.target.files);
                    e.target.value = '';
                  }}
                  className="hidden"
                />

                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => phoneCameraRef.current?.click()}
                    className="px-3 py-2.5 rounded-xl bg-[#E06D2B] hover:bg-[#EB7B3B] text-xs font-semibold text-[#121211] flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Camera className="w-3.5 h-3.5" />
                    <span>Camera</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => phoneGalleryRef.current?.click()}
                    className="px-3 py-2.5 rounded-xl bg-[#1A1A18] hover:bg-[#22221F] border border-[#2A2A27] text-xs font-medium text-[#F2EFE9] flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <ImagePlus className="w-3.5 h-3.5 text-[#E06D2B]" />
                    <span>Photos</span>
                  </button>
                </div>

                {queuedScans.length > 0 && (
                  <div className="space-y-2">
                    {queuedScans.map((item) => (
                      <div
                        key={item.id}
                        className="p-2 rounded-xl bg-[#1A1A18] border border-[#2A2A27] flex items-center gap-2.5"
                      >
                        <img
                          src={item.previewUrl}
                          alt={item.file.name}
                          className="w-10 h-10 rounded-lg object-cover shrink-0 border border-[#2A2A27]"
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="text-[11px] text-[#F2EFE9] truncate">
                            {item.file.name}
                          </div>
                          <select
                            value={item.pageType}
                            onChange={(e) =>
                              handleUpdateScanPageType(
                                item.id,
                                e.target.value as LinerNotePageType
                              )
                            }
                            className="w-full px-2 py-1 rounded-md bg-[#121211] border border-[#2A2A27] text-[11px] text-[#F2EFE9]"
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
                          onClick={() => handleRemoveQueuedScan(item.id)}
                          aria-label={`Remove ${item.file.name}`}
                          className="p-1 text-[#9E9B93] hover:text-[#FCA5A5] cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}

                    <label className="flex items-center gap-2 text-[11px] text-[#C9C5BC] cursor-pointer">
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
                      disabled={uploadingScans || !selectedScanAlbum}
                      className="w-full py-2.5 rounded-xl bg-[#E06D2B] hover:bg-[#EB7B3B] text-xs font-semibold text-[#121211] flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>
                        {uploadingScans
                          ? 'Syncing...'
                          : `Sync ${queuedScans.length} Scan${queuedScans.length === 1 ? '' : 's'}`}
                      </span>
                    </button>
                  </div>
                )}

                {scanFeedback && (
                  <div className="p-2.5 rounded-xl bg-[#E06D2B]/10 border border-[#E06D2B]/30 text-[11px] text-[#F2EFE9]">
                    {scanFeedback}
                  </div>
                )}

                {scanError && (
                  <div className="p-2.5 rounded-xl bg-[#DC2626]/10 border border-[#DC2626]/30 text-[11px] text-[#FCA5A5]">
                    {scanError}
                  </div>
                )}

                {selectedScanAlbum && (
                  <div className="pt-2 border-t border-[#232320] space-y-2">
                    <div className="text-[11px] font-medium text-[#9E9B93]">
                      Synced Scans ({selectedScanAlbum.liner_notes.length})
                    </div>
                    {selectedScanAlbum.liner_notes.length === 0 ? (
                      <div className="text-[11px] text-[#706D66]">
                        No sleeve or gatefold scans yet for this release.
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-2">
                        {selectedScanAlbum.liner_notes.map((note) => (
                          <div
                            key={note.id}
                            className="rounded-lg overflow-hidden border border-[#2A2A27] bg-[#1A1A18]"
                          >
                            <img
                              src={note.relative_image_path}
                              alt={note.page_type}
                              className="w-full aspect-square object-cover"
                            />
                            <div className="px-1.5 py-1 text-[10px] text-[#C9C5BC] truncate">
                              {formatPageTypeLabel(note.page_type)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
