import React, { useEffect, useRef, useState } from 'react';
import { Pressable, SafeAreaView, ScrollView, Text, View } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import { useAudioPlayer } from 'expo-audio';
import type { AlbumWithDetails, Track } from '@remus/shared';

export default function App() {
  const [serverUri, setServerUri] = useState<string | null>(null);
  const [albums, setAlbums] = useState<AlbumWithDetails[]>([]);
  const [activeTrack, setActiveTrack] = useState<Track | null>(null);
  const [offlineTrackIds, setOfflineTrackIds] = useState<Record<string, boolean>>({});
  const [scanMode, setScanMode] = useState<'none' | 'qr' | 'liner'>('none');
  const [scanAlbumId, setScanAlbumId] = useState<string | null>(null);
  const [uploadingScan, setUploadingScan] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView | null>(null);
  const dbRef = useRef<SQLite.SQLiteDatabase | null>(null);

  const streamUrl =
    serverUri && activeTrack ? `${serverUri}/api/stream/${activeTrack.id}` : null;
  const player = useAudioPlayer(streamUrl ? { uri: streamUrl } : null);

  useEffect(() => {
    async function initLocalDb() {
      const db = await SQLite.openDatabaseAsync('remus_mobile.db');
      dbRef.current = db;
      await db.execAsync(`
        CREATE TABLE IF NOT EXISTS storage_roots (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          provider_type TEXT NOT NULL,
          base_uri TEXT NOT NULL,
          default_media_format TEXT,
          is_online INTEGER DEFAULT 1
        );
        CREATE TABLE IF NOT EXISTS albums (
          id TEXT PRIMARY KEY,
          storage_root_id TEXT REFERENCES storage_roots(id),
          relative_folder_path TEXT NOT NULL,
          title TEXT NOT NULL,
          artist TEXT NOT NULL,
          release_year INTEGER,
          media_format TEXT NOT NULL,
          catalog_number TEXT,
          record_label TEXT,
          pressing_notes TEXT,
          metadata_source TEXT,
          needs_liner_notes INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE IF NOT EXISTS tracks (
          id TEXT PRIMARY KEY,
          album_id TEXT REFERENCES albums(id) ON DELETE CASCADE,
          relative_file_path TEXT NOT NULL,
          disc_number INTEGER DEFAULT 1,
          track_number INTEGER NOT NULL,
          title TEXT NOT NULL,
          artist TEXT,
          duration_ms INTEGER NOT NULL,
          sample_rate INTEGER,
          bit_depth INTEGER,
          codec TEXT,
          accuraterip_confidence INTEGER,
          gapless_next_track_id TEXT
        );
        CREATE TABLE IF NOT EXISTS liner_notes (
          id TEXT PRIMARY KEY,
          album_id TEXT REFERENCES albums(id) ON DELETE CASCADE,
          page_type TEXT NOT NULL,
          page_order INTEGER NOT NULL,
          relative_image_path TEXT NOT NULL,
          extracted_ocr_text TEXT,
          ai_confidence_score REAL
        );
      `);
    }
    initLocalDb();
  }, []);

  async function cacheTrackOffline(track: Track) {
    if (!serverUri) return;
    const localDir = `${FileSystem.documentDirectory}remus_cache/`;
    await FileSystem.makeDirectoryAsync(localDir, { intermediates: true });
    const target = `${localDir}${track.id}.wav`;
    await FileSystem.downloadAsync(`${serverUri}/api/stream/${track.id}?download=1`, target);
    setOfflineTrackIds((prev) => ({ ...prev, [track.id]: true }));
  }

  async function makeAlbumAvailableOffline(album: AlbumWithDetails) {
    for (const track of album.tracks) {
      await cacheTrackOffline(track);
    }
  }

  async function syncLibrary(hostUrl: string) {
    const res = await fetch(`${hostUrl}/api/albums`);
    const data = (await res.json()) as AlbumWithDetails[];
    setAlbums(data);
  }

  function handleQrScanned(raw: string) {
    try {
      const payload = JSON.parse(raw) as { hostUrl: string };
      setServerUri(payload.hostUrl);
      setScanMode('none');
      syncLibrary(payload.hostUrl);
    } catch {
      setScanMode('none');
    }
  }

  async function captureAndUploadScan() {
    if (!cameraRef.current || !serverUri || !scanAlbumId) return;
    setUploadingScan(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (!photo?.uri) return;

      const formData = new FormData();
      formData.append('page_type', 'gatefold');
      formData.append('run_ocr', 'true');
      formData.append('image', {
        uri: photo.uri,
        name: `sleeve_${Date.now()}.jpg`,
        type: 'image/jpeg',
      } as unknown as Blob);

      await fetch(`${serverUri}/api/albums/${scanAlbumId}/liner-notes`, {
        method: 'POST',
        body: formData,
      });
      await syncLibrary(serverUri);
      setScanMode('none');
      setScanAlbumId(null);
    } finally {
      setUploadingScan(false);
    }
  }

  if (scanMode !== 'none') {
    if (!permission?.granted) {
      return (
        <SafeAreaView className="flex-1 bg-[#121211] items-center justify-center p-6">
          <Text className="text-[#F2EFE9] text-base mb-4">
            Camera access is required to pair or scan sleeve & liner notes.
          </Text>
          <Pressable
            onPress={requestPermission}
            className="bg-[#E06D2B] px-5 py-3 rounded-lg"
          >
            <Text className="text-[#121211] font-semibold">Grant Camera Access</Text>
          </Pressable>
        </SafeAreaView>
      );
    }

    return (
      <SafeAreaView className="flex-1 bg-[#121211]">
        <CameraView
          ref={cameraRef}
          style={{ flex: 1 }}
          onBarcodeScanned={
            scanMode === 'qr' ? (e) => handleQrScanned(e.data) : undefined
          }
        />
        {scanMode === 'liner' && (
          <Pressable
            disabled={uploadingScan}
            onPress={captureAndUploadScan}
            className="mx-4 mt-4 bg-[#E06D2B] py-3.5 rounded-lg items-center"
          >
            <Text className="text-[#121211] font-semibold">
              {uploadingScan ? 'Uploading Scan...' : 'Capture & Upload Sleeve Scan'}
            </Text>
          </Pressable>
        )}
        <Pressable
          onPress={() => {
            setScanMode('none');
            setScanAlbumId(null);
          }}
          className="m-4 bg-[#1A1A18] border border-[#2A2A27] py-3 rounded-lg items-center"
        >
          <Text className="text-[#F2EFE9] font-medium">Cancel Scanner</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-[#121211]">
      <View className="px-5 py-4 border-b border-[#2A2A27] flex-row items-center justify-between">
        <Text className="text-[#F2EFE9] text-xl font-semibold">Remus</Text>
        <Pressable
          onPress={() => setScanMode('qr')}
          className="bg-[#E06D2B] px-3 py-2 rounded-md"
        >
          <Text className="text-[#121211] text-xs font-semibold">Pair Desktop</Text>
        </Pressable>
      </View>

      <ScrollView className="flex-1 p-5">
        {albums.map((album) => {
          const allOffline =
            album.tracks.length > 0 && album.tracks.every((t) => offlineTrackIds[t.id]);
          return (
            <View
              key={album.id}
              className="mb-4 p-4 rounded-xl bg-[#1A1A18] border border-[#2A2A27]"
            >
              <View className="flex-row items-start justify-between gap-2">
                <View className="flex-1">
                  <Text className="text-[#F2EFE9] text-base font-semibold">{album.title}</Text>
                  <Text className="text-[#9E9B93] text-xs mt-1">
                    {album.artist} · {album.media_format.toUpperCase()} · {album.release_year}
                  </Text>
                </View>
                <View className="items-end gap-2">
                  <Pressable
                    onPress={() => makeAlbumAvailableOffline(album)}
                    className="px-3 py-1.5 rounded-md border border-[#2A2A27] bg-[#121211]"
                  >
                    <Text className="text-[#E06D2B] text-xs font-medium">
                      {allOffline ? 'Available Offline' : 'Make Available Offline'}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      setScanAlbumId(album.id);
                      setScanMode('liner');
                    }}
                    className="px-3 py-1.5 rounded-md border border-[#2A2A27] bg-[#121211]"
                  >
                    <Text className="text-[#F2EFE9] text-xs font-medium">
                      Scan Sleeve ({album.liner_notes.length})
                    </Text>
                  </Pressable>
                </View>
              </View>
              {album.tracks.map((track) => (
                <Pressable
                  key={track.id}
                  onPress={() => {
                    setActiveTrack(track);
                    player.play();
                  }}
                  onLongPress={() => cacheTrackOffline(track)}
                  className="mt-3 py-2 border-t border-[#2A2A27] flex-row justify-between"
                >
                  <Text className="text-[#F2EFE9] text-sm">
                    {track.track_number}. {track.title}
                  </Text>
                  <Text className="text-[#9E9B93] text-xs">
                    {track.bit_depth}/{((track.sample_rate ?? 44100) / 1000).toFixed(1)}kHz
                  </Text>
                </Pressable>
              ))}
            </View>
          );
        })}
      </ScrollView>

      {activeTrack && (
        <View className="px-5 py-3.5 border-t border-[#2A2A27] bg-[#161614] flex-row items-center justify-between gap-3">
          <View className="flex-1">
            <Text className="text-[#F2EFE9] text-sm font-semibold" numberOfLines={1}>
              {activeTrack.title}
            </Text>
            <Text className="text-[#9E9B93] text-xs">Now Playing</Text>
          </View>
          <Pressable
            onPress={() => cacheTrackOffline(activeTrack)}
            className="px-3 py-2 rounded-lg border border-[#2A2A27] bg-[#1A1A18]"
          >
            <Text className="text-[#E06D2B] text-xs font-semibold">
              {offlineTrackIds[activeTrack.id] ? 'Available Offline' : 'Make Available Offline'}
            </Text>
          </Pressable>
        </View>
      )}
    </SafeAreaView>
  );
}
