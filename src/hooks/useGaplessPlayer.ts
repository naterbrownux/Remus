import { useCallback, useEffect, useRef, useState } from 'react';
import type { AlbumWithDetails, Track } from '../../packages/shared/src/types';

const OFFLINE_CACHE_NAME = 'remus-offline-audio-v1';
const RECENTLY_PLAYED_STORAGE_KEY = 'remus-recently-played-v1';

export interface ActiveQueueItem {
  track: Track;
  album: AlbumWithDetails;
}

export interface RecentPlayedItem {
  trackId: string;
  albumId: string;
  playedAt: string;
}

function loadRecentlyPlayed(): RecentPlayedItem[] {
  try {
    const raw = localStorage.getItem(RECENTLY_PLAYED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function useGaplessPlayer() {
  const audioARef = useRef<HTMLAudioElement | null>(null);
  const audioBRef = useRef<HTMLAudioElement | null>(null);
  const activeSlotRef = useRef<'A' | 'B'>('A');
  const preloadedTrackIdRef = useRef<string | null>(null);

  const [queue, setQueue] = useState<ActiveQueueItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.85);
  const [isMuted, setIsMuted] = useState(false);
  const [cachedTrackIds, setCachedTrackIds] = useState<Set<string>>(new Set());
  const [recentlyPlayed, setRecentlyPlayed] = useState<RecentPlayedItem[]>(loadRecentlyPlayed);
  const [lastRangeInfo, setLastRangeInfo] = useState<string>('HTTP 206 Partial Content');

  const currentItem = currentIndex >= 0 && currentIndex < queue.length ? queue[currentIndex] : null;

  const refreshOfflineCacheIndex = useCallback(async () => {
    if (!('caches' in window)) return;
    try {
      const cache = await caches.open(OFFLINE_CACHE_NAME);
      const keys = await cache.keys();
      const ids = new Set<string>();
      for (const req of keys) {
        const match = req.url.match(/\/api\/stream\/([^/?#]+)/);
        if (match?.[1]) ids.add(match[1]);
      }
      setCachedTrackIds(ids);
    } catch {
      // Cache API unavailable in restricted contexts
    }
  }, []);

  useEffect(() => {
    refreshOfflineCacheIndex();
  }, [refreshOfflineCacheIndex]);

  const getAudioEl = useCallback((slot: 'A' | 'B') => {
    if (!audioARef.current) {
      audioARef.current = new Audio();
      audioARef.current.preload = 'auto';
    }
    if (!audioBRef.current) {
      audioBRef.current = new Audio();
      audioBRef.current.preload = 'auto';
    }
    return slot === 'A' ? audioARef.current : audioBRef.current;
  }, []);

  const resolveStreamSrc = useCallback(async (trackId: string): Promise<string> => {
    const streamUrl = `/api/stream/${trackId}`;
    if ('caches' in window) {
      try {
        const cache = await caches.open(OFFLINE_CACHE_NAME);
        const cached = await cache.match(streamUrl);
        if (cached) {
          const blob = await cached.blob();
          setLastRangeInfo('Offline Local Cache');
          return URL.createObjectURL(blob);
        }
      } catch {
        // Fallback to network stream
      }
    }
    setLastRangeInfo('HTTP 206 Partial Content');
    return streamUrl;
  }, []);

  const preloadNextTrack = useCallback(
    async (nextItem: ActiveQueueItem | undefined) => {
      if (!nextItem) return;
      if (preloadedTrackIdRef.current === nextItem.track.id) return;
      const standbySlot = activeSlotRef.current === 'A' ? 'B' : 'A';
      const standbyEl = getAudioEl(standbySlot);
      const src = await resolveStreamSrc(nextItem.track.id);
      standbyEl.src = src;
      standbyEl.load();
      preloadedTrackIdRef.current = nextItem.track.id;
    },
    [getAudioEl, resolveStreamSrc]
  );

  const startIndex = useCallback(
    async (items: ActiveQueueItem[], idx: number) => {
      if (idx < 0 || idx >= items.length) return;
      const item = items[idx];

      const currentSlot = activeSlotRef.current;
      const currentEl = getAudioEl(currentSlot);
      currentEl.pause();

      const nextSlot = currentSlot === 'A' ? 'B' : 'A';
      const targetEl = getAudioEl(nextSlot);

      // Reuse preloaded element if it matches
      if (preloadedTrackIdRef.current !== item.track.id) {
        targetEl.src = await resolveStreamSrc(item.track.id);
        targetEl.load();
      }

      activeSlotRef.current = nextSlot;
      preloadedTrackIdRef.current = null;
      targetEl.volume = isMuted ? 0 : volume;
      targetEl.currentTime = 0;

      setQueue(items);
      setCurrentIndex(idx);
      setCurrentTime(0);
      setDuration((item.track.duration_ms || 14000) / 1000);

      setRecentlyPlayed((prev) => {
        const entry: RecentPlayedItem = {
          trackId: item.track.id,
          albumId: item.album.id,
          playedAt: new Date().toISOString(),
        };
        const updated = [entry, ...prev.filter((p) => p.trackId !== item.track.id)].slice(0, 12);
        try {
          localStorage.setItem(RECENTLY_PLAYED_STORAGE_KEY, JSON.stringify(updated));
        } catch {
          // Ignore storage quota errors
        }
        return updated;
      });

      try {
        await targetEl.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }

      // Preload gapless successor
      const explicitNext = item.track.gapless_next_track_id
        ? items.find((q) => q.track.id === item.track.gapless_next_track_id)
        : items[idx + 1];
      preloadNextTrack(explicitNext);
    },
    [getAudioEl, isMuted, preloadNextTrack, resolveStreamSrc, volume]
  );

  const playAlbum = useCallback(
    (album: AlbumWithDetails, startTrackId?: string) => {
      if (album.tracks.length === 0) return;
      const items: ActiveQueueItem[] = album.tracks.map((track) => ({ track, album }));
      const idx = startTrackId
        ? Math.max(0, items.findIndex((i) => i.track.id === startTrackId))
        : 0;
      startIndex(items, idx);
    },
    [startIndex]
  );

  const togglePlayPause = useCallback(async () => {
    const activeEl = getAudioEl(activeSlotRef.current);
    if (!currentItem) return;
    if (isPlaying) {
      activeEl.pause();
      setIsPlaying(false);
    } else {
      try {
        await activeEl.play();
        setIsPlaying(true);
      } catch {
        setIsPlaying(false);
      }
    }
  }, [currentItem, getAudioEl, isPlaying]);

  const playNext = useCallback(() => {
    if (queue.length === 0) return;
    const nextIdx = currentIndex + 1;
    if (nextIdx < queue.length) {
      startIndex(queue, nextIdx);
    } else {
      const activeEl = getAudioEl(activeSlotRef.current);
      activeEl.pause();
      setIsPlaying(false);
    }
  }, [currentIndex, getAudioEl, queue, startIndex]);

  const playPrevious = useCallback(() => {
    if (queue.length === 0) return;
    const activeEl = getAudioEl(activeSlotRef.current);
    if (activeEl.currentTime > 3) {
      activeEl.currentTime = 0;
      setCurrentTime(0);
      return;
    }
    const prevIdx = Math.max(0, currentIndex - 1);
    startIndex(queue, prevIdx);
  }, [currentIndex, getAudioEl, queue, startIndex]);

  const seekTo = useCallback(
    (seconds: number) => {
      const activeEl = getAudioEl(activeSlotRef.current);
      activeEl.currentTime = seconds;
      setCurrentTime(seconds);
    },
    [getAudioEl]
  );

  const updateVolume = useCallback(
    (val: number) => {
      const clamped = Math.max(0, Math.min(1, val));
      setVolume(clamped);
      setIsMuted(clamped === 0);
      const activeEl = getAudioEl(activeSlotRef.current);
      activeEl.volume = clamped;
    },
    [getAudioEl]
  );

  const toggleMute = useCallback(() => {
    const activeEl = getAudioEl(activeSlotRef.current);
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    activeEl.volume = nextMuted ? 0 : volume;
  }, [getAudioEl, isMuted, volume]);

  const triggerBlobDownload = useCallback((blob: Blob, track: Track) => {
    const extMatch = track.relative_file_path.match(/\.[a-z0-9]+$/i);
    const ext = extMatch ? extMatch[0] : '.wav';
    const safeTitle = `${String(track.track_number).padStart(2, '0')} - ${track.title}`.replace(
      /[^a-z0-9._ -]/gi,
      '_'
    );
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = `${safeTitle}${ext}`;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1500);
  }, []);

  const makeTrackAvailableOffline = useCallback(
    async (track: Track, downloadFile = true) => {
      const url = `/api/stream/${track.id}`;
      const res = await fetch(url);
      if (!res.ok) return;

      const resClone = res.clone();
      if ('caches' in window) {
        try {
          const cache = await caches.open(OFFLINE_CACHE_NAME);
          await cache.put(url, resClone);
        } catch {
          // CacheStorage unavailable
        }
      }

      if (downloadFile) {
        const blob = await res.blob();
        triggerBlobDownload(blob, track);
      }

      await refreshOfflineCacheIndex();
    },
    [refreshOfflineCacheIndex, triggerBlobDownload]
  );

  const removeTrackOfflineCache = useCallback(
    async (track: Track) => {
      if (!('caches' in window)) return;
      const cache = await caches.open(OFFLINE_CACHE_NAME);
      await cache.delete(`/api/stream/${track.id}`);
      await refreshOfflineCacheIndex();
    },
    [refreshOfflineCacheIndex]
  );

  const cacheAlbumOffline = useCallback(
    async (album: AlbumWithDetails, downloadFiles = true) => {
      for (let i = 0; i < album.tracks.length; i++) {
        await makeTrackAvailableOffline(album.tracks[i], downloadFiles);
        if (downloadFiles && i < album.tracks.length - 1) {
          await new Promise((r) => setTimeout(r, 220));
        }
      }
    },
    [makeTrackAvailableOffline]
  );

  const removeAlbumOfflineCache = useCallback(
    async (album: AlbumWithDetails) => {
      if (!('caches' in window)) return;
      const cache = await caches.open(OFFLINE_CACHE_NAME);
      for (const track of album.tracks) {
        await cache.delete(`/api/stream/${track.id}`);
      }
      await refreshOfflineCacheIndex();
    },
    [refreshOfflineCacheIndex]
  );

  useEffect(() => {
    const elA = getAudioEl('A');
    const elB = getAudioEl('B');

    const handleTimeUpdate = (slot: 'A' | 'B') => () => {
      if (activeSlotRef.current !== slot) return;
      const el = slot === 'A' ? elA : elB;
      setCurrentTime(el.currentTime);
      if (Number.isFinite(el.duration) && el.duration > 0) {
        setDuration(el.duration);
      }
    };

    const handleEnded = (slot: 'A' | 'B') => () => {
      if (activeSlotRef.current !== slot) return;
      playNext();
    };

    const onTimeA = handleTimeUpdate('A');
    const onTimeB = handleTimeUpdate('B');
    const onEndedA = handleEnded('A');
    const onEndedB = handleEnded('B');

    elA.addEventListener('timeupdate', onTimeA);
    elB.addEventListener('timeupdate', onTimeB);
    elA.addEventListener('ended', onEndedA);
    elB.addEventListener('ended', onEndedB);

    return () => {
      elA.removeEventListener('timeupdate', onTimeA);
      elB.removeEventListener('timeupdate', onTimeB);
      elA.removeEventListener('ended', onEndedA);
      elB.removeEventListener('ended', onEndedB);
    };
  }, [getAudioEl, playNext]);

  return {
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
    playAlbum,
    playQueueIndex: startIndex,
    togglePlayPause,
    playNext,
    playPrevious,
    seekTo,
    updateVolume,
    toggleMute,
    makeTrackAvailableOffline,
    removeTrackOfflineCache,
    cacheAlbumOffline,
    removeAlbumOfflineCache,
  };
}
