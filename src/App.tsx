import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AudioLines,
  Check,
  ChevronDown,
  ChevronRight,
  Disc,
  Disc3,
  FolderGit2,
  HardDrive,
  HardDriveDownload,
  Library,
  Play,
  Plus,
  Search,
  SlidersHorizontal,
  Smartphone,
  Trash2,
} from 'lucide-react';
import type {
  AlbumWithDetails,
  MediaFormat,
  StorageRoot,
} from '../packages/shared/src/types';
import { AddReleaseModal } from './components/AddReleaseModal';
import { AlbumDetailView } from './components/AlbumDetailView';
import { CdRipperView } from './components/CdRipperView';
import { MobileSyncView } from './components/MobileSyncView';
import { MonorepoView } from './components/MonorepoView';
import { NowPlayingView } from './components/NowPlayingView';
import { PlayerBar } from './components/PlayerBar';
import { StorageRootsView } from './components/StorageRootsView';
import { useGaplessPlayer } from './hooks/useGaplessPlayer';
import {
  formatAudioSpec,
  formatMediaFormatLabel,
  getAlbumCoverUrl,
} from './lib/formatters';

type NavSection = 'library' | 'now-playing' | 'storage' | 'ripper' | 'mobile' | 'monorepo';
type FormatFilter = 'all' | MediaFormat;

export default function App() {
  const [section, setSection] = useState<NavSection>('library');
  const [albums, setAlbums] = useState<AlbumWithDetails[]>([]);
  const [storageRoots, setStorageRoots] = useState<StorageRoot[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedAlbumId, setSelectedAlbumId] = useState<string | null>(null);
  const [formatFilter, setFormatFilter] = useState<FormatFilter>('all');
  const [rootFilter, setRootFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [downloadingAlbumIds, setDownloadingAlbumIds] = useState<Set<string>>(new Set());

  const player = useGaplessPlayer();

  const fetchData = useCallback(async () => {
    setLoadError(null);
    try {
      const [albumsRes, rootsRes] = await Promise.all([
        fetch('/api/albums'),
        fetch('/api/storage-roots'),
      ]);
      if (!albumsRes.ok || !rootsRes.ok) {
        throw new Error('Failed to load Remus local catalog.');
      }
      const [albumsJson, rootsJson] = await Promise.all([
        albumsRes.json() as Promise<AlbumWithDetails[]>,
        rootsRes.json() as Promise<StorageRoot[]>,
      ]);
      setAlbums(albumsJson);
      setStorageRoots(rootsJson);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Server unreachable.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const selectedAlbum = useMemo(
    () => albums.find((a) => a.id === selectedAlbumId) || null,
    [albums, selectedAlbumId]
  );

  const filteredAlbums = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return albums.filter((album) => {
      if (formatFilter !== 'all' && album.media_format !== formatFilter) return false;
      if (rootFilter !== 'all' && album.storage_root_id !== rootFilter) return false;
      if (!q) return true;
      return (
        album.title.toLowerCase().includes(q) ||
        album.artist.toLowerCase().includes(q) ||
        (album.catalog_number || '').toLowerCase().includes(q) ||
        (album.record_label || '').toLowerCase().includes(q)
      );
    });
  }, [albums, formatFilter, rootFilter, searchQuery]);

  const totalTracks = useMemo(
    () => albums.reduce((sum, a) => sum + a.tracks.length, 0),
    [albums]
  );

  const primaryNavItems: Array<{ id: NavSection; label: string; icon: typeof Library }> = [
    { id: 'now-playing', label: 'Now Playing', icon: AudioLines },
    { id: 'library', label: 'Library', icon: Library },
    { id: 'ripper', label: 'CD Ripper', icon: Disc },
    { id: 'mobile', label: 'Mobile Sync', icon: Smartphone },
  ];

  const advancedNavItems: Array<{ id: NavSection; label: string; icon: typeof Library }> = [
    { id: 'storage', label: 'File Browser', icon: HardDrive },
    { id: 'monorepo', label: 'Monorepo', icon: FolderGit2 },
  ];

  const allNavItems = [...primaryNavItems, ...advancedNavItems];
  const isAdvancedActive = advancedNavItems.some((item) => item.id === section);
  const isAdvancedExpanded = advancedOpen;

  const breadcrumbLabel =
    section === 'library'
      ? selectedAlbum
        ? `Library / ${selectedAlbum.title}`
        : 'Library'
      : isAdvancedActive
        ? `Advanced / ${advancedNavItems.find((n) => n.id === section)?.label || ''}`
        : primaryNavItems.find((n) => n.id === section)?.label || 'Library';

  return (
    <div className="h-screen w-screen overflow-hidden flex flex-col bg-[#121211] text-[#F2EFE9]">
      <div className="flex-1 flex min-h-0">
        {/* Desktop Sidebar */}
        <aside className="hidden md:flex flex-col w-60 shrink-0 bg-[#161614] border-r border-[#2A2A27]">
          <div className="h-16 px-6 border-b border-[#2A2A27] flex items-center">
            <button
              type="button"
              onClick={() => {
                setSection('library');
                setSelectedAlbumId(null);
              }}
              className="font-display text-xl font-semibold tracking-tight text-[#F2EFE9] whitespace-nowrap shrink-0 cursor-pointer"
            >
              Remus
            </button>
          </div>

          <nav className="flex-1 px-3 py-5 space-y-1">
            {primaryNavItems.map((item) => {
              const Icon = item.icon;
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    setSection(item.id);
                    if (item.id !== 'library') {
                      setSelectedAlbumId(null);
                    }
                  }}
                  className={`w-full px-3 py-2.5 rounded-lg text-sm font-medium flex items-center gap-3 transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-[#22221F] text-[#F2EFE9]'
                      : 'text-[#9E9B93] hover:text-[#F2EFE9] hover:bg-[#1C1C1A]'
                  }`}
                >
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      active ? 'text-[#E06D2B]' : 'text-[#706D66]'
                    }`}
                  />
                  <span>{item.label}</span>
                </button>
              );
            })}

            <div className="pt-3 mt-3 border-t border-[#232320]">
              <button
                type="button"
                aria-expanded={isAdvancedExpanded}
                onClick={() => setAdvancedOpen((prev) => !prev)}
                className={`w-full px-3 py-2.5 rounded-lg text-sm font-medium flex items-center justify-between transition-colors cursor-pointer whitespace-nowrap ${
                  isAdvancedActive
                    ? 'text-[#F2EFE9]'
                    : 'text-[#9E9B93] hover:text-[#F2EFE9] hover:bg-[#1C1C1A]'
                }`}
              >
                <span className="flex items-center gap-3">
                  <SlidersHorizontal
                    className={`w-4 h-4 shrink-0 ${
                      isAdvancedActive ? 'text-[#E06D2B]' : 'text-[#706D66]'
                    }`}
                  />
                  <span>Advanced</span>
                </span>
                {isAdvancedExpanded ? (
                  <ChevronDown className="w-3.5 h-3.5 text-[#706D66]" />
                ) : (
                  <ChevronRight className="w-3.5 h-3.5 text-[#706D66]" />
                )}
              </button>

              {isAdvancedExpanded && (
                <div className="mt-1 space-y-1 pl-4">
                  {advancedNavItems.map((item) => {
                    const Icon = item.icon;
                    const active = section === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                          setSection(item.id);
                          setSelectedAlbumId(null);
                          setAdvancedOpen(true);
                        }}
                        className={`w-full px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-3 transition-colors cursor-pointer whitespace-nowrap ${
                          active
                            ? 'bg-[#22221F] text-[#F2EFE9]'
                            : 'text-[#9E9B93] hover:text-[#F2EFE9] hover:bg-[#1C1C1A]'
                        }`}
                      >
                        <Icon
                          className={`w-4 h-4 shrink-0 ${
                            active ? 'text-[#E06D2B]' : 'text-[#706D66]'
                          }`}
                        />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </nav>

          <div className="px-6 py-4 border-t border-[#2A2A27] text-xs text-[#706D66] space-y-1 tabular-nums">
            <div className="text-[#9E9B93] font-medium">Local Studio Node</div>
            <div>
              {albums.length} Releases · {totalTracks} Tracks
            </div>
            <div>{player.cachedTrackIds.size} Tracks Cached Offline</div>
          </div>
        </aside>

        {/* Main Workspace */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0">
          {/* Top Bar */}
          <header className="h-16 shrink-0 border-b border-[#2A2A27] px-4 md:px-8 flex items-center justify-between gap-8 bg-[#121211]">
            <div className="flex items-center gap-3 min-w-0">
              <span className="md:hidden font-display text-lg font-semibold text-[#F2EFE9] whitespace-nowrap shrink-0">
                Remus
              </span>
              <span className="hidden md:inline text-sm font-medium text-[#C9C5BC] truncate">
                {breadcrumbLabel}
              </span>
            </div>

            <div className="flex-1 max-w-md hidden sm:block">
              <div className="relative">
                <Search className="w-4 h-4 text-[#706D66] absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    if (section !== 'library') setSection('library');
                    if (selectedAlbumId) setSelectedAlbumId(null);
                  }}
                  placeholder="Search releases, artists, catalog numbers..."
                  className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-[#1A1A18] border border-[#2A2A27] text-sm text-[#F2EFE9] placeholder:text-[#706D66] focus:outline-none focus:border-[#E06D2B]"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#E06D2B] hover:bg-[#EB7B3B] text-xs font-semibold text-[#121211] transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Music</span>
            </button>
          </header>

          {/* Mobile Compact Nav */}
          <div className="md:hidden flex items-center gap-1 px-4 py-2 border-b border-[#2A2A27] overflow-x-auto bg-[#161614] shrink-0">
            {allNavItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setSection(item.id);
                  if (item.id !== 'library') setSelectedAlbumId(null);
                }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer ${
                  section === item.id
                    ? 'bg-[#E06D2B] text-[#121211]'
                    : 'text-[#9E9B93]'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          {/* Viewport */}
          <main className="flex-1 overflow-y-auto px-4 md:px-8 py-7">
            <div className="max-w-[1280px] mx-auto">
              {loadError && (
                <div className="mb-6 p-4 rounded-xl bg-[#DC2626]/10 border border-[#DC2626]/30 text-sm text-[#FCA5A5] flex items-center justify-between">
                  <span>{loadError}</span>
                  <button
                    type="button"
                    onClick={fetchData}
                    className="underline text-xs cursor-pointer"
                  >
                    Retry
                  </button>
                </div>
              )}

              {section === 'library' && selectedAlbum && (
                <AlbumDetailView
                  album={selectedAlbum}
                  activeTrackId={player.currentItem?.track.id || null}
                  isPlaying={player.isPlaying}
                  cachedTrackIds={player.cachedTrackIds}
                  onBack={() => setSelectedAlbumId(null)}
                  onPlayAlbum={player.playAlbum}
                  onCacheOffline={player.cacheAlbumOffline}
                  onRemoveOfflineCache={player.removeAlbumOfflineCache}
                  onRefreshAlbum={fetchData}
                  onDeleted={async () => {
                    setSelectedAlbumId(null);
                    await fetchData();
                  }}
                />
              )}

              {section === 'library' && !selectedAlbum && (
                <div className="space-y-7">
                  {/* Library Header & Format Filter Bar */}
                  <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
                    <div>
                      <h1 className="text-2xl md:text-3xl font-semibold text-[#F2EFE9] tracking-tight">
                        Physical Media Archive
                      </h1>
                      <p className="text-sm text-[#9E9B93] mt-1">
                        Lossless local transfers from vinyl, compact discs, and calibrated cassettes
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-1 p-1 bg-[#161614] border border-[#2A2A27] rounded-lg">
                        {(
                          [
                            { id: 'all', label: 'All Formats' },
                            { id: 'vinyl', label: 'Vinyl' },
                            { id: 'cd', label: 'CD' },
                            { id: 'cassette', label: 'Cassette' },
                            { id: 'digital', label: 'Digital' },
                          ] as const
                        ).map((tab) => (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setFormatFilter(tab.id)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                              formatFilter === tab.id
                                ? 'bg-[#262623] text-[#F2EFE9]'
                                : 'text-[#9E9B93] hover:text-[#F2EFE9]'
                            }`}
                          >
                            {tab.label}
                          </button>
                        ))}
                      </div>

                      <select
                        value={rootFilter}
                        onChange={(e) => setRootFilter(e.target.value)}
                        aria-label="Filter by File Browser volume"
                        className="px-3 py-2 rounded-lg bg-[#161614] border border-[#2A2A27] text-xs text-[#C9C5BC] focus:outline-none focus:border-[#E06D2B]"
                      >
                        <option value="all">All File Browser Volumes</option>
                        {storageRoots.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Loading Skeleton */}
                  {loading ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                      {[1, 2, 3, 4].map((n) => (
                        <div
                          key={n}
                          className="rounded-xl border border-[#2A2A27] bg-[#161614] p-4 space-y-3 animate-pulse"
                        >
                          <div className="aspect-square rounded-lg bg-[#22221F]" />
                          <div className="h-4 w-3/4 bg-[#22221F] rounded" />
                          <div className="h-3 w-1/2 bg-[#22221F] rounded" />
                        </div>
                      ))}
                    </div>
                  ) : filteredAlbums.length === 0 ? (
                    <div className="p-12 rounded-xl border border-[#2A2A27] bg-[#161614] text-center space-y-3">
                      <Disc3 className="w-8 h-8 text-[#706D66] mx-auto" />
                      <h2 className="text-base font-semibold text-[#F2EFE9]">
                        No matching physical releases
                      </h2>
                      <p className="text-sm text-[#9E9B93] max-w-md mx-auto">
                        Adjust your format or volume filter, or catalog a new vinyl, CD, or cassette release.
                      </p>
                      <button
                        type="button"
                        onClick={() => setShowAddModal(true)}
                        className="mt-2 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#E06D2B] text-xs font-semibold text-[#121211] cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Add Music</span>
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                      {filteredAlbums.map((album) => {
                        const coverUrl = getAlbumCoverUrl(album);
                        const leadTrack = album.tracks[0];
                        const isAlbumActive =
                          player.currentItem?.album.id === album.id;
                        return (
                          <article
                            key={album.id}
                            className="group rounded-xl border border-[#2A2A27] bg-[#161614] hover:border-[#3D3D38] transition-colors overflow-hidden flex flex-col"
                          >
                            <div className="relative aspect-square bg-[#1E1E1B] overflow-hidden">
                              <button
                                type="button"
                                onClick={() => setSelectedAlbumId(album.id)}
                                className="w-full h-full block cursor-pointer focus-visible:outline-none"
                              >
                                {coverUrl ? (
                                  <img
                                    src={coverUrl}
                                    alt={album.title}
                                    referrerPolicy="no-referrer"
                                    className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-200"
                                  />
                                ) : (
                                  <div className="w-full h-full flex flex-col items-center justify-center p-6 text-center text-[#706D66] bg-[#1A1A18]">
                                    <Disc3 className="w-10 h-10 mb-2" />
                                    <span className="text-xs font-medium text-[#9E9B93]">
                                      {album.title}
                                    </span>
                                  </div>
                                )}
                              </button>

                              {leadTrack && (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    player.playAlbum(album);
                                  }}
                                  aria-label={`Play ${album.title}`}
                                  className={`absolute bottom-3 right-3 w-10 h-10 rounded-full bg-[#E06D2B] hover:bg-[#EB7B3B] text-[#121211] flex items-center justify-center shadow-lg transition-opacity cursor-pointer ${
                                    isAlbumActive
                                      ? 'opacity-100'
                                      : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                                  }`}
                                >
                                  <Play className="w-4 h-4 fill-current ml-0.5" />
                                </button>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => setSelectedAlbumId(album.id)}
                              className="p-4 text-left space-y-1.5 flex-1 flex flex-col justify-between cursor-pointer"
                            >
                              <div>
                                <h2 className="text-base font-semibold text-[#F2EFE9] truncate group-hover:text-[#E06D2B] transition-colors">
                                  {album.title}
                                </h2>
                                <p className="text-sm text-[#C9C5BC] truncate">
                                  {album.artist}
                                </p>
                              </div>

                              <div className="pt-2 text-xs text-[#9E9B93] flex items-center gap-1.5 truncate tabular-nums">
                                <span>{formatMediaFormatLabel(album.media_format)}</span>
                                {album.release_year && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="font-mono">{album.release_year}</span>
                                  </>
                                )}
                                {leadTrack && (
                                  <>
                                    <span aria-hidden="true">·</span>
                                    <span className="font-mono">
                                      {formatAudioSpec(
                                        leadTrack.bit_depth,
                                        leadTrack.sample_rate,
                                        leadTrack.codec
                                      )}
                                    </span>
                                  </>
                                )}
                              </div>
                            </button>

                            <div className="px-4 py-2.5 border-t border-[#232320] flex items-center justify-between gap-2 bg-[#141412]">
                              {(() => {
                                const isDownloading = downloadingAlbumIds.has(album.id);
                                const isOfflineReady =
                                  album.tracks.length > 0 &&
                                  album.tracks.every((t) => player.cachedTrackIds.has(t.id));

                                if (isOfflineReady) {
                                  return (
                                    <>
                                      <button
                                        type="button"
                                        disabled={isDownloading}
                                        onClick={async () => {
                                          setDownloadingAlbumIds((prev) => new Set(prev).add(album.id));
                                          try {
                                            await player.cacheAlbumOffline(album, true);
                                          } finally {
                                            setDownloadingAlbumIds((prev) => {
                                              const next = new Set(prev);
                                              next.delete(album.id);
                                              return next;
                                            });
                                          }
                                        }}
                                        className="inline-flex items-center gap-1.5 text-xs font-medium text-[#E06D2B] hover:underline cursor-pointer min-h-[36px]"
                                      >
                                        <Check className="w-3.5 h-3.5 shrink-0" />
                                        <span>
                                          {isDownloading ? 'Downloading...' : 'Available Offline'}
                                        </span>
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => player.removeAlbumOfflineCache(album)}
                                        aria-label={`Remove ${album.title} from offline cache`}
                                        title="Remove offline copy"
                                        className="p-1.5 rounded-md text-[#706D66] hover:text-[#FCA5A5] cursor-pointer"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </>
                                  );
                                }

                                return (
                                  <button
                                    type="button"
                                    disabled={isDownloading || album.tracks.length === 0}
                                    onClick={async () => {
                                      setDownloadingAlbumIds((prev) => new Set(prev).add(album.id));
                                      try {
                                        await player.cacheAlbumOffline(album, true);
                                      } finally {
                                        setDownloadingAlbumIds((prev) => {
                                          const next = new Set(prev);
                                          next.delete(album.id);
                                          return next;
                                        });
                                      }
                                    }}
                                    className="w-full inline-flex items-center justify-center gap-2 py-1.5 text-xs font-medium text-[#C9C5BC] hover:text-[#F2EFE9] disabled:opacity-40 transition-colors cursor-pointer min-h-[36px]"
                                  >
                                    <HardDriveDownload className="w-3.5 h-3.5 text-[#E06D2B] shrink-0" />
                                    <span>
                                      {isDownloading
                                        ? 'Downloading...'
                                        : 'Make Available Offline'}
                                    </span>
                                  </button>
                                );
                              })()}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {section === 'now-playing' && (
                <NowPlayingView
                  albums={albums}
                  queue={player.queue}
                  currentIndex={player.currentIndex}
                  currentItem={player.currentItem}
                  isPlaying={player.isPlaying}
                  currentTime={player.currentTime}
                  duration={player.duration}
                  volume={player.volume}
                  isMuted={player.isMuted}
                  cachedTrackIds={player.cachedTrackIds}
                  lastRangeInfo={player.lastRangeInfo}
                  onTogglePlay={player.togglePlayPause}
                  onPrev={player.playPrevious}
                  onNext={player.playNext}
                  onSeek={player.seekTo}
                  onVolumeChange={player.updateVolume}
                  onToggleMute={player.toggleMute}
                  onSelectQueueIndex={(idx) => player.playQueueIndex(player.queue, idx)}
                  onPlayAlbum={player.playAlbum}
                  onOpenAlbum={(albumId) => {
                    setSelectedAlbumId(albumId);
                    setSection('library');
                  }}
                  onBrowseLibrary={() => {
                    setSelectedAlbumId(null);
                    setSection('library');
                  }}
                  onMakeTrackOffline={(track) => player.makeTrackAvailableOffline(track, true)}
                  onRemoveTrackOffline={player.removeTrackOfflineCache}
                />
              )}

              {section === 'storage' && (
                <StorageRootsView
                  storageRoots={storageRoots}
                  albums={albums}
                  activeTrackId={player.currentItem?.track.id || null}
                  onRefresh={fetchData}
                  onPlayAlbum={player.playAlbum}
                  onOpenAlbum={(albumId) => {
                    setSelectedAlbumId(albumId);
                    setSection('library');
                  }}
                />
              )}

              {section === 'ripper' && (
                <CdRipperView
                  storageRoots={storageRoots}
                  onRipped={async (created) => {
                    await fetchData();
                    setSelectedAlbumId(created.id);
                    setSection('library');
                  }}
                />
              )}

              {section === 'mobile' && (
                <MobileSyncView
                  albums={albums}
                  cachedTrackIds={player.cachedTrackIds}
                  onPlayAlbum={player.playAlbum}
                  onCacheOffline={player.cacheAlbumOffline}
                  onRemoveOfflineCache={player.removeAlbumOfflineCache}
                />
              )}

              {section === 'monorepo' && <MonorepoView />}
            </div>
          </main>
        </div>
      </div>

      {/* Persistent Studio Lossless Player */}
      <PlayerBar
        currentItem={player.currentItem}
        isPlaying={player.isPlaying}
        currentTime={player.currentTime}
        duration={player.duration}
        volume={player.volume}
        isMuted={player.isMuted}
        isCachedOffline={
          player.currentItem
            ? player.cachedTrackIds.has(player.currentItem.track.id)
            : false
        }
        lastRangeInfo={player.lastRangeInfo}
        onTogglePlay={player.togglePlayPause}
        onPrev={player.playPrevious}
        onNext={player.playNext}
        onSeek={player.seekTo}
        onVolumeChange={player.updateVolume}
        onToggleMute={player.toggleMute}
        onOpenAlbum={() => {
          if (player.currentItem) {
            setSelectedAlbumId(player.currentItem.album.id);
            setSection('library');
          }
        }}
        onOpenNowPlaying={() => setSection('now-playing')}
      />

      {showAddModal && (
        <AddReleaseModal
          storageRoots={storageRoots}
          onClose={() => setShowAddModal(false)}
          onCreated={fetchData}
        />
      )}
    </div>
  );
}
