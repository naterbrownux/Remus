import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  ChevronRight,
  CornerLeftUp,
  Disc3,
  FileAudio,
  FileImage,
  Folder,
  FolderOpen,
  HardDrive,
  Play,
  Plus,
  Power,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import type {
  AlbumWithDetails,
  MediaFormat,
  StorageProviderType,
  StorageRoot,
} from '../../packages/shared/src/types';
import { formatPageTypeLabel } from '../lib/formatters';

interface BrowseEntry {
  name: string;
  path: string;
  kind: 'folder' | 'audio' | 'image';
  sizeBytes: number | null;
  modifiedAt: string | null;
  albumId: string | null;
  albumTitle: string | null;
  trackId: string | null;
  spec: string | null;
  pageType: string | null;
  previewUrl: string | null;
  itemCount?: number;
}

interface BrowseResponse {
  root: StorageRoot;
  currentPath: string;
  entries: BrowseEntry[];
  offline: boolean;
}

interface StorageRootsViewProps {
  storageRoots: StorageRoot[];
  albums: AlbumWithDetails[];
  activeTrackId: string | null;
  onRefresh: () => Promise<void>;
  onPlayAlbum: (album: AlbumWithDetails, startTrackId?: string) => void;
  onOpenAlbum: (albumId: string) => void;
}

function formatBytes(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function StorageRootsView({
  storageRoots,
  albums,
  activeTrackId,
  onRefresh,
  onPlayAlbum,
  onOpenAlbum,
}: StorageRootsViewProps) {
  const [selectedRootId, setSelectedRootId] = useState<string>(
    storageRoots[0]?.id || ''
  );
  const [currentPath, setCurrentPath] = useState<string>('');
  const [browseData, setBrowseData] = useState<BrowseResponse | null>(null);
  const [loadingDir, setLoadingDir] = useState(false);
  const [selectedEntry, setSelectedEntry] = useState<BrowseEntry | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [providerType, setProviderType] = useState<StorageProviderType>('local_fs');
  const [baseUri, setBaseUri] = useState('');
  const [defaultFormat, setDefaultFormat] = useState<MediaFormat>('vinyl');
  const [submitting, setSubmitting] = useState(false);

  // Keep selectedRootId valid if roots list changes
  useEffect(() => {
    if (
      storageRoots.length > 0 &&
      !storageRoots.some((r) => r.id === selectedRootId)
    ) {
      setSelectedRootId(storageRoots[0].id);
      setCurrentPath('');
      setSelectedEntry(null);
    }
  }, [selectedRootId, storageRoots]);

  const fetchDirectory = useCallback(
    async (rootId: string, dirPath: string) => {
      if (!rootId) return;
      setLoadingDir(true);
      try {
        const params = new URLSearchParams();
        if (dirPath) params.set('path', dirPath);
        const res = await fetch(
          `/api/storage-roots/${rootId}/browse?${params.toString()}`
        );
        if (res.ok) {
          const data = (await res.json()) as BrowseResponse;
          setBrowseData(data);
        }
      } finally {
        setLoadingDir(false);
      }
    },
    []
  );

  useEffect(() => {
    if (selectedRootId) {
      fetchDirectory(selectedRootId, currentPath);
    }
  }, [fetchDirectory, selectedRootId, currentPath, albums]);

  const selectedRoot = useMemo(
    () => storageRoots.find((r) => r.id === selectedRootId) || null,
    [selectedRootId, storageRoots]
  );

  const pathSegments = useMemo(
    () => (currentPath ? currentPath.split('/').filter(Boolean) : []),
    [currentPath]
  );

  const currentFolderAlbum = useMemo(() => {
    if (!selectedRoot || !currentPath) return null;
    return (
      albums.find(
        (a) =>
          a.storage_root_id === selectedRoot.id &&
          a.relative_folder_path.replace(/^\/+|\/+$/g, '') === currentPath
      ) || null
    );
  }, [albums, currentPath, selectedRoot]);

  function navigateTo(rootId: string, nextPath: string) {
    setSelectedRootId(rootId);
    setCurrentPath(nextPath);
    setSelectedEntry(null);
  }

  function navigateUp() {
    if (!currentPath) return;
    const parts = currentPath.split('/').filter(Boolean);
    parts.pop();
    setCurrentPath(parts.join('/'));
    setSelectedEntry(null);
  }

  function handleActivateEntry(entry: BrowseEntry) {
    if (entry.kind === 'folder') {
      setCurrentPath(entry.path);
      setSelectedEntry(null);
      return;
    }
    if (entry.kind === 'audio' && entry.albumId && entry.trackId) {
      const album = albums.find((a) => a.id === entry.albumId);
      if (album) {
        onPlayAlbum(album, entry.trackId);
      }
      return;
    }
    if (entry.kind === 'image' && entry.albumId) {
      onOpenAlbum(entry.albumId);
    }
  }

  async function handleCreateRoot(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !baseUri.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/storage-roots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          provider_type: providerType,
          base_uri: baseUri,
          default_media_format: defaultFormat,
          is_online: 1,
        }),
      });
      if (res.ok) {
        const created = (await res.json()) as StorageRoot;
        setName('');
        setBaseUri('');
        setShowForm(false);
        await onRefresh();
        navigateTo(created.id, '');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleToggleOnline(root: StorageRoot) {
    await fetch(`/api/storage-roots/${root.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_online: root.is_online === 1 ? 0 : 1 }),
    });
    await onRefresh();
    if (root.id === selectedRootId) {
      await fetchDirectory(root.id, currentPath);
    }
  }

  async function handleDeleteRoot(id: string) {
    await fetch(`/api/storage-roots/${id}`, { method: 'DELETE' });
    await onRefresh();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#F2EFE9]">
            File Browser
          </h1>
          <p className="text-sm text-[#9E9B93]">
            Browse local drives, SMB shares, and WebDAV volumes by folder and lossless file
          </p>
        </div>

        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#E06D2B] hover:bg-[#EB7B3B] text-sm font-semibold text-[#121211] transition-colors cursor-pointer whitespace-nowrap"
        >
          <Plus className="w-4 h-4" />
          <span>Add Volume</span>
        </button>
      </div>

      {/* Add Volume Drawer */}
      {showForm && (
        <form
          onSubmit={handleCreateRoot}
          className="p-5 rounded-xl bg-[#1A1A18] border border-[#2A2A27] grid grid-cols-1 md:grid-cols-4 gap-4 items-end"
        >
          <div>
            <label className="block text-xs text-[#9E9B93] mb-1.5">Volume Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Listening Room NAS"
              className="w-full px-3 py-2 rounded-lg bg-[#121211] border border-[#2A2A27] text-sm text-[#F2EFE9]"
            />
          </div>

          <div>
            <label className="block text-xs text-[#9E9B93] mb-1.5">Protocol</label>
            <select
              value={providerType}
              onChange={(e) => setProviderType(e.target.value as StorageProviderType)}
              className="w-full px-3 py-2 rounded-lg bg-[#121211] border border-[#2A2A27] text-sm text-[#F2EFE9]"
            >
              <option value="local_fs">Local Filesystem</option>
              <option value="smb">SMB / CIFS Share</option>
              <option value="webdav">WebDAV Volume</option>
            </select>
          </div>

          <div>
            <label className="block text-xs text-[#9E9B93] mb-1.5">Base URI</label>
            <input
              type="text"
              required
              value={baseUri}
              onChange={(e) => setBaseUri(e.target.value)}
              placeholder="smb://192.168.1.20/lossless"
              className="w-full px-3 py-2 rounded-lg bg-[#121211] border border-[#2A2A27] text-sm font-mono text-[#F2EFE9]"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={defaultFormat}
              onChange={(e) => setDefaultFormat(e.target.value as MediaFormat)}
              className="px-3 py-2 rounded-lg bg-[#121211] border border-[#2A2A27] text-sm text-[#F2EFE9]"
            >
              <option value="vinyl">Vinyl</option>
              <option value="cd">CD</option>
              <option value="cassette">Cassette</option>
              <option value="digital">Digital</option>
            </select>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 rounded-lg bg-[#E06D2B] text-sm font-semibold text-[#121211] cursor-pointer whitespace-nowrap"
            >
              {submitting ? 'Adding...' : 'Save Volume'}
            </button>
          </div>
        </form>
      )}

      {/* Two-Pane File Explorer */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Pane: Volumes */}
        <div className="lg:col-span-4 rounded-xl border border-[#2A2A27] bg-[#161614] overflow-hidden">
          <div className="px-4 py-3 border-b border-[#2A2A27] flex items-center justify-between">
            <span className="text-xs font-semibold text-[#9E9B93]">
              Volumes ({storageRoots.length})
            </span>
          </div>

          <div className="divide-y divide-[#232320]">
            {storageRoots.map((root) => {
              const selected = root.id === selectedRootId;
              const online = root.is_online === 1;
              const albumCount = albums.filter((a) => a.storage_root_id === root.id).length;

              return (
                <div
                  key={root.id}
                  className={`p-3.5 transition-colors ${
                    selected ? 'bg-[#22221F]' : 'hover:bg-[#1B1B18]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => navigateTo(root.id, '')}
                      className="flex items-start gap-2.5 text-left min-w-0 flex-1 cursor-pointer"
                    >
                      {root.provider_type === 'local_fs' ? (
                        <HardDrive
                          className={`w-4 h-4 mt-0.5 shrink-0 ${
                            selected ? 'text-[#E06D2B]' : 'text-[#9E9B93]'
                          }`}
                        />
                      ) : (
                        <FolderOpen
                          className={`w-4 h-4 mt-0.5 shrink-0 ${
                            selected ? 'text-[#E06D2B]' : 'text-[#9E9B93]'
                          }`}
                        />
                      )}
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-[#F2EFE9] truncate">
                          {root.name}
                        </div>
                        <div className="font-mono text-[11px] text-[#706D66] truncate mt-0.5">
                          {root.base_uri}
                        </div>
                        <div className="text-[11px] text-[#9E9B93] mt-1 flex items-center gap-1.5 tabular-nums">
                          <span className={online ? 'text-[#4ADE80]' : 'text-[#9E9B93]'}>
                            {online ? 'Online' : 'Offline'}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono">{root.provider_type}</span>
                          <span aria-hidden="true">·</span>
                          <span>{albumCount} releases</span>
                        </div>
                      </div>
                    </button>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleToggleOnline(root)}
                        title={online ? 'Set volume offline' : 'Connect volume'}
                        aria-label={online ? `Disconnect ${root.name}` : `Connect ${root.name}`}
                        className="p-1.5 rounded-md text-[#9E9B93] hover:text-[#F2EFE9] hover:bg-[#2A2A27] cursor-pointer"
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteRoot(root.id)}
                        title="Remove volume"
                        aria-label={`Remove ${root.name}`}
                        className="p-1.5 rounded-md text-[#9E9B93] hover:text-[#FCA5A5] hover:bg-[#2A2A27] cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Pane: Directory & File Listing */}
        <div className="lg:col-span-8 space-y-4">
          <div className="rounded-xl border border-[#2A2A27] bg-[#161614] overflow-hidden">
            {/* Path Breadcrumb Toolbar */}
            <div className="px-4 py-3 border-b border-[#2A2A27] flex flex-wrap items-center justify-between gap-3 bg-[#1A1A18]">
              <div className="flex items-center gap-1.5 min-w-0 flex-wrap text-xs">
                <button
                  type="button"
                  disabled={!currentPath}
                  onClick={navigateUp}
                  aria-label="Up one folder"
                  className="p-1.5 rounded-md border border-[#2A2A27] text-[#C9C5BC] hover:text-[#F2EFE9] disabled:opacity-35 cursor-pointer disabled:cursor-default mr-1"
                >
                  <CornerLeftUp className="w-3.5 h-3.5" />
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCurrentPath('');
                    setSelectedEntry(null);
                  }}
                  className={`px-2 py-1 rounded-md font-medium cursor-pointer truncate max-w-[200px] ${
                    !currentPath
                      ? 'text-[#F2EFE9] bg-[#262623]'
                      : 'text-[#9E9B93] hover:text-[#F2EFE9]'
                  }`}
                >
                  {selectedRoot?.name || 'Root'}
                </button>

                {pathSegments.map((seg, idx) => {
                  const segPath = pathSegments.slice(0, idx + 1).join('/');
                  const isLast = idx === pathSegments.length - 1;
                  return (
                    <div key={segPath} className="flex items-center gap-1 min-w-0">
                      <ChevronRight className="w-3.5 h-3.5 text-[#706D66] shrink-0" />
                      <button
                        type="button"
                        onClick={() => {
                          setCurrentPath(segPath);
                          setSelectedEntry(null);
                        }}
                        className={`px-2 py-1 rounded-md font-mono truncate max-w-[180px] cursor-pointer ${
                          isLast
                            ? 'text-[#F2EFE9] bg-[#262623]'
                            : 'text-[#9E9B93] hover:text-[#F2EFE9]'
                        }`}
                      >
                        {seg}
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {currentFolderAlbum && (
                  <button
                    type="button"
                    onClick={() => onOpenAlbum(currentFolderAlbum.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-[#E06D2B] hover:bg-[#EB7B3B] text-xs font-semibold text-[#121211] cursor-pointer whitespace-nowrap"
                  >
                    <Disc3 className="w-3.5 h-3.5" />
                    <span>Open Release</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() =>
                    selectedRootId && fetchDirectory(selectedRootId, currentPath)
                  }
                  aria-label="Refresh directory"
                  className="p-1.5 rounded-md border border-[#2A2A27] text-[#9E9B93] hover:text-[#F2EFE9] cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loadingDir ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>

            {/* File Listing Table */}
            {browseData?.offline ? (
              <div className="p-12 text-center space-y-3">
                <HardDrive className="w-8 h-8 text-[#706D66] mx-auto" />
                <div className="text-sm font-semibold text-[#F2EFE9]">
                  {selectedRoot?.name} is currently offline
                </div>
                <p className="text-xs text-[#9E9B93] max-w-md mx-auto font-mono">
                  {selectedRoot?.base_uri}
                </p>
                {selectedRoot && (
                  <button
                    type="button"
                    onClick={() => handleToggleOnline(selectedRoot)}
                    className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#E06D2B] text-xs font-semibold text-[#121211] cursor-pointer"
                  >
                    <Power className="w-3.5 h-3.5" />
                    <span>Connect Volume</span>
                  </button>
                )}
              </div>
            ) : loadingDir && !browseData ? (
              <div className="p-8 text-sm text-[#9E9B93]">Reading directory...</div>
            ) : !browseData || browseData.entries.length === 0 ? (
              <div className="p-12 text-center space-y-2">
                <Folder className="w-8 h-8 text-[#706D66] mx-auto" />
                <div className="text-sm font-medium text-[#F2EFE9]">
                  Empty directory
                </div>
                <p className="text-xs text-[#9E9B93]">
                  Catalog a release or rip a CD to this volume to populate files here.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-[#2A2A27] text-xs text-[#706D66]">
                      <th className="py-2.5 px-4 font-medium">Name</th>
                      <th className="py-2.5 px-4 font-medium">Type / Spec</th>
                      <th className="py-2.5 px-4 font-medium text-right">Size</th>
                      <th className="py-2.5 px-4 font-medium text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#232320] text-sm">
                    {browseData.entries.map((entry) => {
                      const isSelected = selectedEntry?.path === entry.path;
                      const isPlayingThis =
                        entry.trackId != null && entry.trackId === activeTrackId;
                      return (
                        <tr
                          key={entry.path}
                          onClick={() => setSelectedEntry(entry)}
                          onDoubleClick={() => handleActivateEntry(entry)}
                          className={`h-11 cursor-pointer transition-colors ${
                            isPlayingThis
                              ? 'bg-[#E06D2B]/10'
                              : isSelected
                                ? 'bg-[#22221F]'
                                : 'hover:bg-[#1B1B18]'
                          }`}
                        >
                          <td className="px-4">
                            <div className="flex items-center gap-2.5 min-w-0">
                              {entry.kind === 'folder' ? (
                                <Folder className="w-4 h-4 text-[#E06D2B] shrink-0" />
                              ) : entry.kind === 'audio' ? (
                                <FileAudio className="w-4 h-4 text-[#C9C5BC] shrink-0" />
                              ) : (
                                <FileImage className="w-4 h-4 text-[#9E9B93] shrink-0" />
                              )}
                              <span
                                className={`truncate font-mono text-xs ${
                                  isPlayingThis ? 'text-[#E06D2B] font-semibold' : 'text-[#F2EFE9]'
                                }`}
                              >
                                {entry.name}
                              </span>
                            </div>
                          </td>

                          <td className="px-4 text-xs text-[#9E9B93] font-mono whitespace-nowrap">
                            {entry.kind === 'folder'
                              ? entry.spec || `${entry.itemCount || 0} items`
                              : entry.kind === 'image' && entry.pageType
                                ? formatPageTypeLabel(entry.pageType)
                                : entry.spec || 'File'}
                          </td>

                          <td className="px-4 font-mono text-xs text-[#9E9B93] text-right tabular-nums whitespace-nowrap">
                            {entry.kind === 'folder'
                              ? `${entry.itemCount ?? 0} items`
                              : formatBytes(entry.sizeBytes)}
                          </td>

                          <td className="px-4 text-right whitespace-nowrap">
                            {entry.kind === 'folder' ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleActivateEntry(entry);
                                }}
                                className="text-xs text-[#E06D2B] hover:underline cursor-pointer"
                              >
                                Open
                              </button>
                            ) : entry.kind === 'audio' ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleActivateEntry(entry);
                                }}
                                className="inline-flex items-center gap-1 text-xs text-[#E06D2B] hover:underline cursor-pointer"
                              >
                                <Play className="w-3 h-3 fill-current" />
                                <span>Stream</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleActivateEntry(entry);
                                }}
                                className="text-xs text-[#C9C5BC] hover:text-[#F2EFE9] hover:underline cursor-pointer"
                              >
                                View Scan
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Selected Entry Inspector */}
          {selectedEntry && selectedRoot && (
            <div className="p-4 rounded-xl border border-[#2A2A27] bg-[#161614] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3.5 min-w-0">
                {selectedEntry.kind === 'image' && selectedEntry.previewUrl && (
                  <img
                    src={selectedEntry.previewUrl}
                    alt={selectedEntry.name}
                    referrerPolicy="no-referrer"
                    className="w-12 h-12 rounded-lg object-cover border border-[#2A2A27] shrink-0"
                  />
                )}
                <div className="min-w-0 space-y-0.5">
                  <div className="text-sm font-medium text-[#F2EFE9] truncate">
                    {selectedEntry.name}
                  </div>
                  <div className="font-mono text-[11px] text-[#9E9B93] truncate">
                    {selectedRoot.base_uri.replace(/\/+$/, '')}/{selectedEntry.path}
                  </div>
                  {selectedEntry.albumTitle && (
                    <div className="text-xs text-[#706D66]">
                      Indexed Release: {selectedEntry.albumTitle}
                    </div>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => handleActivateEntry(selectedEntry)}
                className="px-3.5 py-2 rounded-lg bg-[#22221F] hover:bg-[#2C2C28] border border-[#2A2A27] text-xs font-medium text-[#F2EFE9] cursor-pointer whitespace-nowrap shrink-0"
              >
                {selectedEntry.kind === 'folder'
                  ? 'Open Folder'
                  : selectedEntry.kind === 'audio'
                    ? 'Play Lossless Stream'
                    : 'Inspect Liner Note'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
