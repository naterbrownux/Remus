import { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  HardDriveDownload,
  Play,
  Smartphone,
  Trash2,
  Wifi,
} from 'lucide-react';
import type { AlbumWithDetails, PairingInfo } from '../../packages/shared/src/types';
import { formatAudioSpec, getAlbumCoverUrl } from '../lib/formatters';

interface MobileSyncViewProps {
  albums: AlbumWithDetails[];
  cachedTrackIds: Set<string>;
  onPlayAlbum: (album: AlbumWithDetails, startTrackId?: string) => void;
  onCacheOffline: (album: AlbumWithDetails) => Promise<void>;
  onRemoveOfflineCache: (album: AlbumWithDetails) => Promise<void>;
}

export function MobileSyncView({
  albums,
  cachedTrackIds,
  onPlayAlbum,
  onCacheOffline,
  onRemoveOfflineCache,
}: MobileSyncViewProps) {
  const [pairing, setPairing] = useState<PairingInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [rangeProbeResult, setRangeProbeResult] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);
  const [busyAlbumId, setBusyAlbumId] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/pairing')
      .then((r) => r.json())
      .then((data: PairingInfo) => setPairing(data))
      .catch(() => {});
  }, []);

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

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-[#F2EFE9]">
          Local Wi-Fi Pairing & Mobile Client
        </h1>
        <p className="text-sm text-[#9E9B93]">
          Zero-cloud LAN discovery via mDNS, QR pairing, HTTP Range lossless streaming, and device offline cache
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left: Pairing QR & LAN Range Verification */}
        <div className="lg:col-span-7 space-y-6">
          <div className="p-6 rounded-xl bg-[#161614] border border-[#2A2A27] flex flex-col sm:flex-row items-center gap-6">
            <div className="w-44 h-44 rounded-xl bg-[#1A1A18] border border-[#2A2A27] p-3 shrink-0 flex items-center justify-center">
              {pairing?.qrSvg ? (
                <div
                  className="w-full h-full [&>svg]:w-full [&>svg]:h-full"
                  dangerouslySetInnerHTML={{ __html: pairing.qrSvg }}
                />
              ) : (
                <span className="text-xs text-[#706D66]">Generating QR...</span>
              )}
            </div>

            <div className="space-y-3 min-w-0 flex-1">
              <div className="flex items-center gap-2 text-xs text-[#E06D2B] font-medium">
                <Wifi className="w-4 h-4" />
                <span>mDNS Broadcast Active</span>
              </div>
              <h2 className="text-lg font-semibold text-[#F2EFE9]">
                Pair Remus Expo Mobile App
              </h2>
              <p className="text-xs text-[#9E9B93] leading-relaxed">
                Open the Remus mobile client on the same Wi-Fi network and scan this QR code to sync your SQLite catalog and stream lossless audio via HTTP Range requests.
              </p>

              {pairing && (
                <div className="pt-2 space-y-1.5 text-xs font-mono">
                  <div className="text-[#C9C5BC] truncate">
                    Service: {pairing.mdnsService}
                  </div>
                  <div className="text-[#C9C5BC] truncate">
                    LAN Endpoint: {pairing.localIpHint}
                  </div>
                  <div className="text-[#9E9B93]">Token: {pairing.pairingToken}</div>
                </div>
              )}

              <div className="pt-2 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    if (!pairing) return;
                    navigator.clipboard?.writeText(pairing.payloadJson);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1800);
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#2A2A27] text-xs font-medium text-[#F2EFE9] hover:bg-[#22221F] cursor-pointer"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-[#E06D2B]" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copied ? 'Payload Copied' : 'Copy Pairing JSON'}</span>
                </button>

                <button
                  type="button"
                  disabled={probing}
                  onClick={probeHttpRangeStream}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#22221F] hover:bg-[#2C2C28] border border-[#2A2A27] text-xs font-medium text-[#F2EFE9] cursor-pointer"
                >
                  <span>{probing ? 'Testing Range...' : 'Verify HTTP 206 Range'}</span>
                </button>
              </div>

              {rangeProbeResult && (
                <div className="p-2.5 rounded-lg bg-[#121211] border border-[#2A2A27] font-mono text-[11px] text-[#4ADE80] break-all">
                  {rangeProbeResult}
                </div>
              )}
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
                        {album.artist} · {album.tracks.length} tracks
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

        {/* Right: Mobile Client Companion Preview */}
        <div className="lg:col-span-5 flex justify-center">
          <div className="w-full max-w-[360px] rounded-[28px] border border-[#2A2A27] bg-[#121211] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#2A2A27] flex items-center justify-between bg-[#161614]">
              <div className="flex items-center gap-2">
                <Smartphone className="w-4 h-4 text-[#E06D2B]" />
                <span className="text-sm font-semibold text-[#F2EFE9]">Remus Mobile</span>
              </div>
              <span className="text-[11px] font-mono text-[#9E9B93]">Wi-Fi Synced</span>
            </div>

            <div className="p-4 space-y-3 max-h-[480px] overflow-y-auto">
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
                        <div className="text-xs text-[#9E9B93] truncate">
                          {album.artist} · {isCached ? 'Offline' : 'LAN Stream'}
                        </div>
                      </div>
                      {firstTrack && (
                        <button
                          type="button"
                          onClick={() => onPlayAlbum(album, firstTrack.id)}
                          aria-label={`Play ${album.title} from mobile preview`}
                          className="w-10 h-10 rounded-full bg-[#E06D2B] text-[#121211] flex items-center justify-center shrink-0 cursor-pointer"
                        >
                          <Play className="w-4 h-4 fill-current ml-0.5" />
                        </button>
                      )}
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
          </div>
        </div>
      </div>
    </div>
  );
}
