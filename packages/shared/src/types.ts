export type StorageProviderType = 'local_fs' | 'smb' | 'webdav';

export type MediaFormat = 'vinyl' | 'cd' | 'cassette' | 'digital';

export type LinerNotePageType =
  | 'front_cover'
  | 'back_cover'
  | 'gatefold'
  | 'booklet'
  | 'j_card';

export interface StorageRoot {
  id: string;
  name: string;
  provider_type: StorageProviderType;
  base_uri: string;
  default_media_format: MediaFormat | null;
  is_online: number; // 1 | 0
}

export interface Album {
  id: string;
  storage_root_id: string | null;
  relative_folder_path: string;
  title: string;
  artist: string;
  release_year: number | null;
  media_format: MediaFormat;
  catalog_number: string | null;
  record_label: string | null;
  pressing_notes: string | null;
  metadata_source: string | null;
  needs_liner_notes: number; // 1 | 0
  created_at: string;
}

export interface Track {
  id: string;
  album_id: string;
  relative_file_path: string;
  disc_number: number;
  track_number: number;
  title: string;
  artist: string | null;
  duration_ms: number;
  sample_rate: number | null;
  bit_depth: number | null;
  codec: string | null;
  accuraterip_confidence: number | null;
  gapless_next_track_id: string | null;
}

export interface LinerNote {
  id: string;
  album_id: string;
  page_type: LinerNotePageType;
  page_order: number;
  relative_image_path: string;
  extracted_ocr_text: string | null;
  ai_confidence_score: number | null;
}

export interface AlbumWithDetails extends Album {
  storage_root_name?: string | null;
  tracks: Track[];
  liner_notes: LinerNote[];
}

export interface PairingInfo {
  serverName: string;
  hostUrl: string;
  localIpHint: string;
  mdnsService: string;
  pairingToken: string;
  qrSvg: string;
  scanUrl: string;
  scanQrSvg: string;
  payloadJson: string;
}

export interface MonorepoFile {
  path: string;
  category: 'shared' | 'desktop' | 'mobile';
  language: string;
  content: string;
}
