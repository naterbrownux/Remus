import {
  Disc3,
  HardDriveDownload,
  Maximize2,
  Pause,
  Play,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { ActiveQueueItem } from '../hooks/useGaplessPlayer';
import {
  formatAudioSpec,
  formatSeconds,
  getAlbumCoverUrl,
} from '../lib/formatters';

interface PlayerBarProps {
  currentItem: ActiveQueueItem | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  isCachedOffline: boolean;
  lastRangeInfo: string;
  onTogglePlay: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (sec: number) => void;
  onVolumeChange: (val: number) => void;
  onToggleMute: () => void;
  onOpenAlbum: () => void;
  onOpenNowPlaying: () => void;
}

export function PlayerBar({
  currentItem,
  isPlaying,
  currentTime,
  duration,
  volume,
  isMuted,
  isCachedOffline,
  lastRangeInfo,
  onTogglePlay,
  onPrev,
  onNext,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onOpenAlbum,
  onOpenNowPlaying,
}: PlayerBarProps) {
  const coverUrl = currentItem ? getAlbumCoverUrl(currentItem.album) : null;
  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <footer className="h-20 shrink-0 bg-[#161614] border-t border-[#2A2A27] px-4 md:px-6 flex items-center justify-between gap-4 z-30">
      {/* Left: Active Track & Spec */}
      <div className="flex items-center gap-3.5 min-w-0 w-1/3">
        {currentItem ? (
          <button
            type="button"
            onClick={onOpenAlbum}
            className="flex items-center gap-3.5 text-left min-w-0 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E06D2B] rounded-md"
          >
            <div className="w-12 h-12 rounded-md overflow-hidden bg-[#22221F] border border-[#2A2A27] shrink-0 flex items-center justify-center">
              {coverUrl ? (
                <img
                  src={coverUrl}
                  alt={currentItem.album.title}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <Disc3 className="w-5 h-5 text-[#9E9B93]" />
              )}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-[#F2EFE9] truncate group-hover:text-[#E06D2B] transition-colors">
                {currentItem.track.title}
              </div>
              <div className="text-xs text-[#9E9B93] truncate flex items-center gap-1.5 tabular-nums">
                <span>{currentItem.track.artist || currentItem.album.artist}</span>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-[11px]">
                  {formatAudioSpec(
                    currentItem.track.bit_depth,
                    currentItem.track.sample_rate,
                    currentItem.track.codec
                  )}
                </span>
              </div>
            </div>
          </button>
        ) : (
          <div className="flex items-center gap-3 text-[#706D66]">
            <div className="w-12 h-12 rounded-md bg-[#1C1C1A] border border-[#2A2A27] flex items-center justify-center shrink-0">
              <Disc3 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-sm font-medium text-[#9E9B93]">No Track Loaded</div>
              <div className="text-xs text-[#706D66]">Select a release to begin lossless playback</div>
            </div>
          </div>
        )}
      </div>

      {/* Center: Transport & Seeker */}
      <div className="flex flex-col items-center gap-1.5 flex-1 max-w-xl">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onPrev}
            disabled={!currentItem}
            aria-label="Previous track"
            className="p-2 text-[#9E9B93] hover:text-[#F2EFE9] disabled:opacity-35 transition-colors cursor-pointer disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E06D2B] rounded-md"
          >
            <SkipBack className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onTogglePlay}
            disabled={!currentItem}
            aria-label={isPlaying ? 'Pause' : 'Play'}
            className="w-10 h-10 rounded-full bg-[#E06D2B] hover:bg-[#EB7B3B] text-[#121211] flex items-center justify-center disabled:opacity-35 transition-colors cursor-pointer disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#F2EFE9]"
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
          </button>

          <button
            type="button"
            onClick={onNext}
            disabled={!currentItem}
            aria-label="Next track"
            className="p-2 text-[#9E9B93] hover:text-[#F2EFE9] disabled:opacity-35 transition-colors cursor-pointer disabled:cursor-default focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E06D2B] rounded-md"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>

        <div className="w-full flex items-center gap-2.5 text-[11px] font-mono text-[#9E9B93] tabular-nums">
          <span className="w-9 text-right">{formatSeconds(currentTime)}</span>
          <div className="relative flex-1 h-4 flex items-center">
            <div className="w-full h-1 bg-[#2A2A27] rounded-full overflow-hidden">
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
              disabled={!currentItem}
              onChange={(e) => onSeek(Number(e.target.value))}
              aria-label="Seek track position"
              className="absolute inset-0 w-full opacity-0 cursor-pointer disabled:cursor-default"
            />
          </div>
          <span className="w-9">{formatSeconds(duration)}</span>
        </div>
      </div>

      {/* Right: Stream Mode & Volume */}
      <div className="hidden md:flex items-center justify-end gap-4 w-1/3">
        {currentItem && (
          <div className="flex items-center gap-1.5 text-xs text-[#9E9B93] font-mono whitespace-nowrap">
            {isCachedOffline && (
              <HardDriveDownload className="w-3.5 h-3.5 text-[#E06D2B]" aria-hidden="true" />
            )}
            <span>{isCachedOffline ? 'Cached Offline' : lastRangeInfo}</span>
          </div>
        )}

        <div className="flex items-center gap-2 w-28">
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={isMuted ? 'Unmute' : 'Mute'}
            className="p-1.5 text-[#9E9B93] hover:text-[#F2EFE9] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E06D2B] rounded-md"
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
            aria-label="Volume"
            className="w-full accent-[#E06D2B] cursor-pointer"
          />
        </div>

        <button
          type="button"
          onClick={onOpenNowPlaying}
          aria-label="Open Now Playing screen"
          title="Open Now Playing"
          className="p-2 rounded-lg border border-[#2A2A27] text-[#9E9B93] hover:text-[#F2EFE9] hover:bg-[#1E1E1B] transition-colors cursor-pointer shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E06D2B]"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </footer>
  );
}
