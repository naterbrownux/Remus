import { useEffect, useState } from 'react';
import {
  ArrowUpRight,
  BookOpen,
  Check,
  Disc3,
  HardDriveDownload,
  ListMusic,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Trash2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { AlbumWithDetails, Track } from '../../packages/shared/src/types';
import type { ActiveQueueItem, RecentPlayedItem } from '../hooks/useGaplessPlayer';
import {
  formatAudioSpec,
  formatDurationMs,
  formatMediaFormatLabel,
  formatPageTypeLabel,
  formatSeconds,
  getAlbumCoverUrl,
} from '../lib/formatters';

interface NowPlayingViewProps {
  albums: AlbumWithDetails[];
  queue: ActiveQueueItem[];
  currentIndex: number;
  currentItem: ActiveQueueItem | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  cachedTrackIds: Set<string>;
  recentlyPlayed: RecentPlayedItem[];
  lastRangeInfo: string;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (sec: number) => void;
  onVolumeChange: (val: number) => void;
  onToggleMute: () => void;
  onSelectQueueIndex: (index: number) => void;
  onPlayAlbum: (album: AlbumWithDetails, startTrackId?: string) => void;
  onOpenAlbum: (albumId: string) => void;
  onBrowseLibrary: () => void;
  onMakeTrackOffline: (track: Track) => Promise<void>;
  onRemoveTrackOffline: (track: Track) => Promise<void>;
}

export function NowPlayingView({
  albums,
  queue,
  currentIndex,
  currentItem,
  isPlaying,
  currentTime,
  duration,
  volume,
  isMuted,
  cachedTrackIds,
  recentlyPlayed,
  lastRangeInfo,
  onTogglePlay,
  onPrev,
  onNext,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onSelectQueueIndex,
  onPlayAlbum,
  onOpenAlbum,
  onBrowseLibrary,
  onMakeTrackOffline,
  onRemoveTrackOffline,
}: NowPlayingViewProps) {
  const [rightTab, setRightTab] = useState<'queue' | 'liner'>('queue');
  const [selectedLinerId, setSelectedLinerId] = useState<string | null>(null);
  const [downloadingTrack, setDownloadingTrack] = useState(false);

  useEffect(() => {
    if (currentItem) {
      setSelectedLinerId(currentItem.album.liner_notes[0]?.id || null);
    }
  }, [currentItem?.album.id]);

  if (!currentItem) {
    return (
      <div className="space-y-8">
        <div className="p-8 md:p-12 rounded-xl border border-[#2A2A27] bg-[#161614] flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="space-y-3 max-w-lg">
            <h1 className="text-2xl md:text-3xl font-semibold text-[#F2EFE9] tracking-tight">
              Nothing Playing
            </h1>
            <p className="text-sm text-[#9E9B93] leading-relaxed">
              Select any vinyl transfer, compact disc rip, or calibrated cassette release below to start lossless HTTP Range playback with gapless track preloading.
            </p>
            <div className="pt-2">
              <button
                type="button"
                onClick={onBrowseLibrary}
                className="px-4 py-2 rounded-lg bg-[#E06D2B] hover:bg-[#EB7B3B] text-xs font-semibold text-[#121211] cursor-pointer whitespace-nowrap"
              >
                Browse Library
              </button>
            </div>
          </div>

          <div className="w-28 h-28 rounded-full border border-[#2A2A27] bg-[#1A1A18] flex items-center justify-center shrink-0">
            <Disc3 className="w-12 h-12 text-[#706D66]" />
          </div>
        </div>

        {(() => {
          const recentFiles = recentlyPlayed
            .map((entry) => {
              const album = albums.find((a) => a.id === entry.albumId);
              const track = album?.tracks.find((t) => t.id === entry.trackId);
              if (!album || !track) return null;
              return { album, track, playedAt: entry.playedAt };
            })
            .filter((item): item is { album: AlbumWithDetails; track: Track; playedAt: string } => item !== null);

          return (
            <section className="space-y-4">
              <h2 className="text-sm font-semibold text-[#9E9B93]">
                Recently Played
              </h2>

              {recentFiles.length === 0 ? (
                <div className="p-6 rounded-xl border border-[#2A2A27] bg-[#161614] text-sm text-[#9E9B93]">
                  No files played yet. Play any track from your Library or File Browser and your most recently played files will appear here.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                  {recentFiles.slice(0, 8).map(({ album, track }) => {
                    const cover = getAlbumCoverUrl(album);
                    const fileName = track.relative_file_path.split('/').pop() || track.relative_file_path;
                    return (
                      <button
                        key={track.id}
                        type="button"
                        onClick={() => onPlayAlbum(album, track.id)}
                        className="group p-3.5 rounded-xl border border-[#2A2A27] bg-[#161614] hover:border-[#3D3D38] text-left flex items-center gap-3.5 transition-colors cursor-pointer"
                      >
                        <div className="w-14 h-14 rounded-lg overflow-hidden bg-[#22221F] shrink-0 flex items-center justify-center">
                          {cover ? (
                            <img
                              src={cover}
                              alt={album.title}
                              referrerPolicy="no-referrer"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Disc3 className="w-6 h-6 text-[#706D66]" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-semibold text-[#F2EFE9] truncate group-hover:text-[#E06D2B] transition-colors">
                            {track.title}
                          </div>
                          <div className="text-xs text-[#9E9B93] truncate">
                            {track.artist || album.artist} · {album.title}
                          </div>
                          <div className="text-[11px] font-mono text-[#706D66] truncate mt-0.5">
                            {fileName}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })()}
      </div>
    );
  }

  const { album, track } = currentItem;
  const coverUrl = getAlbumCoverUrl(album);
  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;
  const remainingSec = Math.max(0, duration - currentTime);
  const isCached = cachedTrackIds.has(track.id);
  const nextQueueItem =
    currentIndex + 1 < queue.length ? queue[currentIndex + 1] : null;
  const activeLinerNote =
    album.liner_notes.find((ln) => ln.id === selectedLinerId) ||
    album.liner_notes[0] ||
    null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
      {/* Left Column: Sleeve Artwork, Title & Tactile Transport */}
      <div className="lg:col-span-6 space-y-6">
        <div className="rounded-2xl overflow-hidden border border-[#2A2A27] bg-[#161614] aspect-square max-w-lg mx-auto lg:mx-0 flex items-center justify-center">
          {coverUrl ? (
            <img
              src={coverUrl}
              alt={album.title}
              referrerPolicy="no-referrer"
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="flex flex-col items-center gap-3 text-[#706D66] p-8 text-center">
              <Disc3 className="w-16 h-16" />
              <span className="text-sm font-medium text-[#9E9B93]">{album.title}</span>
            </div>
          )}
        </div>

        <div className="max-w-lg mx-auto lg:mx-0 space-y-5">
          {/* Track & Release Attribution */}
          <div className="space-y-1.5">
            <div className="text-xs text-[#9E9B93] flex flex-wrap items-center gap-1.5 tabular-nums">
              <span>{formatMediaFormatLabel(album.media_format)}</span>
              {album.release_year && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono">{album.release_year}</span>
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

            <h1 className="text-2xl md:text-3xl font-semibold text-[#F2EFE9] tracking-tight text-balance">
              {track.title}
            </h1>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-[#C9C5BC]">
                {track.artist || album.artist}
                <span className="text-[#706D66]"> — </span>
                <span className="text-[#9E9B93]">{album.title}</span>
              </p>

              <button
                type="button"
                onClick={() => onOpenAlbum(album.id)}
                className="inline-flex items-center gap-1 text-xs font-medium text-[#E06D2B] hover:underline cursor-pointer whitespace-nowrap"
              >
                <span>Open Release</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Scrubber */}
          <div className="space-y-1.5">
            <div className="relative h-5 flex items-center">
              <div className="w-full h-1.5 bg-[#2A2A27] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#E06D2B]"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <input
                type="range"
                min={0}
                max={duration || 1}
                step={0.1}
                value={currentTime}
                onChange={(e) => onSeek(Number(e.target.value))}
                aria-label="Seek position"
                className="absolute inset-0 w-full opacity-0 cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between text-xs font-mono text-[#9E9B93] tabular-nums">
              <span>{formatSeconds(currentTime)}</span>
              <span>-{formatSeconds(remainingSec)}</span>
            </div>
          </div>

          {/* Transport Controls */}
          <div className="flex items-center justify-between gap-4 pt-1">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={onPrev}
                aria-label="Previous track"
                className="p-2.5 rounded-lg border border-[#2A2A27] bg-[#161614] text-[#C9C5BC] hover:text-[#F2EFE9] hover:bg-[#1E1E1B] transition-colors cursor-pointer"
              >
                <SkipBack className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={onTogglePlay}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                className="w-12 h-12 rounded-full bg-[#E06D2B] hover:bg-[#EB7B3B] text-[#121211] flex items-center justify-center transition-colors cursor-pointer"
              >
                {isPlaying ? (
                  <Pause className="w-5 h-5 fill-current" />
                ) : (
                  <Play className="w-5 h-5 fill-current ml-0.5" />
                )}
              </button>

              <button
                type="button"
                onClick={onNext}
                disabled={!nextQueueItem}
                aria-label="Next track"
                className="p-2.5 rounded-lg border border-[#2A2A27] bg-[#161614] text-[#C9C5BC] hover:text-[#F2EFE9] hover:bg-[#1E1E1B] disabled:opacity-35 transition-colors cursor-pointer disabled:cursor-default"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-2 w-32">
              <button
                type="button"
                onClick={onToggleMute}
                aria-label={isMuted ? 'Unmute' : 'Mute'}
                className="p-1.5 text-[#9E9B93] hover:text-[#F2EFE9] cursor-pointer"
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={isMuted ? 0 : volume}
                onChange={(e) => onVolumeChange(Number(e.target.value))}
                aria-label="Playback volume"
                className="w-full accent-[#E06D2B] cursor-pointer"
              />
            </div>
          </div>

          {/* Offline Download Action Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            {isCached ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={downloadingTrack}
                  onClick={async () => {
                    setDownloadingTrack(true);
                    try {
                      await onMakeTrackOffline(track);
                    } finally {
                      setDownloadingTrack(false);
                    }
                  }}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#E06D2B]/40 bg-[#E06D2B]/10 text-xs font-medium text-[#E06D2B] hover:bg-[#E06D2B]/15 transition-colors cursor-pointer min-h-[40px] whitespace-nowrap"
                >
                  <Check className="w-4 h-4 shrink-0" />
                  <span>
                    {downloadingTrack ? 'Downloading...' : 'Available Offline (Download Again)'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveTrackOffline(track)}
                  aria-label="Remove offline copy"
                  title="Remove offline copy"
                  className="p-2.5 rounded-lg border border-[#2A2A27] bg-[#161614] text-[#9E9B93] hover:text-[#FCA5A5] cursor-pointer min-h-[40px]"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                type="button"
                disabled={downloadingTrack}
                onClick={async () => {
                  setDownloadingTrack(true);
                  try {
                    await onMakeTrackOffline(track);
                  } finally {
                    setDownloadingTrack(false);
                  }
                }}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#2A2A27] bg-[#161614] hover:bg-[#1E1E1B] text-xs font-medium text-[#F2EFE9] transition-colors cursor-pointer disabled:opacity-50 min-h-[40px] whitespace-nowrap"
              >
                <HardDriveDownload className="w-4 h-4 text-[#E06D2B] shrink-0" />
                <span>
                  {downloadingTrack ? 'Downloading to Device...' : 'Make Available Offline'}
                </span>
              </button>
            )}
          </div>

          {/* Signal Path Spec Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 pt-4 border-t border-[#2A2A27] text-xs tabular-nums">
            <div>
              <span className="text-[#706D66] block">Audio Stream</span>
              <span className="font-mono text-[#F2EFE9]">
                {formatAudioSpec(track.bit_depth, track.sample_rate, track.codec)}
              </span>
            </div>
            <div>
              <span className="text-[#706D66] block">Transport</span>
              <span className="font-mono text-[#F2EFE9] inline-flex items-center gap-1.5">
                {isCached && <HardDriveDownload className="w-3.5 h-3.5 text-[#E06D2B]" />}
                <span>{isCached ? 'Offline Local Cache' : lastRangeInfo}</span>
              </span>
            </div>
            <div>
              <span className="text-[#706D66] block">Gapless Buffer</span>
              <span className="font-mono text-[#C9C5BC]">
                {nextQueueItem ? `Preloaded #${nextQueueItem.track.track_number}` : 'End of Queue'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Column: Queue & Liner Notes Tabs */}
      <div className="lg:col-span-6 rounded-xl border border-[#2A2A27] bg-[#161614] overflow-hidden">
        <div className="px-4 py-3 border-b border-[#2A2A27] flex items-center justify-between gap-3 bg-[#1A1A18]">
          <div className="flex items-center gap-1 p-1 bg-[#121211] border border-[#2A2A27] rounded-lg">
            <button
              type="button"
              onClick={() => setRightTab('queue')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                rightTab === 'queue'
                  ? 'bg-[#262623] text-[#F2EFE9]'
                  : 'text-[#9E9B93] hover:text-[#F2EFE9]'
              }`}
            >
              <ListMusic className="w-3.5 h-3.5" />
              <span>Up Next ({queue.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setRightTab('liner')}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                rightTab === 'liner'
                  ? 'bg-[#262623] text-[#F2EFE9]'
                  : 'text-[#9E9B93] hover:text-[#F2EFE9]'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Liner Notes ({album.liner_notes.length})</span>
            </button>
          </div>

          <span className="text-xs font-mono text-[#706D66] tabular-nums">
            Track {currentIndex + 1} of {queue.length}
          </span>
        </div>

        {rightTab === 'queue' ? (
          <div className="divide-y divide-[#232320] max-h-[560px] overflow-y-auto">
            {queue.map((item, idx) => {
              const active = idx === currentIndex;
              const itemCached = cachedTrackIds.has(item.track.id);
              return (
                <button
                  key={`${item.track.id}-${idx}`}
                  type="button"
                  onClick={() => onSelectQueueIndex(idx)}
                  className={`w-full px-4 py-3 text-left flex items-center justify-between gap-4 transition-colors cursor-pointer ${
                    active ? 'bg-[#E06D2B]/10' : 'hover:bg-[#1B1B18]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-6 font-mono text-xs text-[#9E9B93] tabular-nums shrink-0">
                      {active && isPlaying ? (
                        <span className="text-[#E06D2B] font-semibold">▶</span>
                      ) : (
                        String(item.track.track_number).padStart(2, '0')
                      )}
                    </span>
                    <div className="min-w-0">
                      <div
                        className={`text-sm font-medium truncate ${
                          active ? 'text-[#E06D2B]' : 'text-[#F2EFE9]'
                        }`}
                      >
                        {item.track.title}
                      </div>
                      <div className="text-xs text-[#706D66] truncate font-mono">
                        {formatAudioSpec(
                          item.track.bit_depth,
                          item.track.sample_rate,
                          item.track.codec
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 shrink-0">
                    {itemCached && (
                      <HardDriveDownload
                        className="w-3.5 h-3.5 text-[#E06D2B]"
                        aria-label="Cached offline"
                      />
                    )}
                    <span className="font-mono text-xs text-[#9E9B93] tabular-nums">
                      {formatDurationMs(item.track.duration_ms)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="p-5 space-y-4 max-h-[560px] overflow-y-auto">
            {album.pressing_notes && (
              <div className="pb-4 border-b border-[#232320] space-y-1">
                <div className="text-xs font-medium text-[#9E9B93]">
                  Pressing & Transfer Notes
                </div>
                <p className="text-sm text-[#C9C5BC] leading-relaxed">
                  {album.pressing_notes}
                </p>
              </div>
            )}

            {album.liner_notes.length === 0 ? (
              <div className="py-8 text-center text-sm text-[#9E9B93]">
                No sleeve scans or liner notes attached to this release.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  {album.liner_notes.map((note) => (
                    <button
                      key={note.id}
                      type="button"
                      onClick={() => setSelectedLinerId(note.id)}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                        activeLinerNote?.id === note.id
                          ? 'bg-[#E06D2B] text-[#121211]'
                          : 'bg-[#121211] border border-[#2A2A27] text-[#9E9B93] hover:text-[#F2EFE9]'
                      }`}
                    >
                      {note.page_order}. {formatPageTypeLabel(note.page_type)}
                    </button>
                  ))}
                </div>

                {activeLinerNote && (
                  <>
                    <div className="rounded-lg overflow-hidden border border-[#2A2A27] bg-[#121211]">
                      <img
                        src={activeLinerNote.relative_image_path}
                        alt={`${album.title} ${activeLinerNote.page_type}`}
                        referrerPolicy="no-referrer"
                        className="w-full max-h-64 object-contain"
                      />
                    </div>
                    <div className="p-3.5 rounded-lg bg-[#121211] border border-[#232320] font-mono text-xs text-[#C9C5BC] whitespace-pre-wrap leading-relaxed">
                      {activeLinerNote.extracted_ocr_text ||
                        'No OCR transcription available for this page yet.'}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
