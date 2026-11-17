import { useRef, useState, type DragEvent } from 'react';
import { ArrowDown, ArrowUp, FileAudio, Upload, X } from 'lucide-react';

export interface QueuedAudioTrack {
  id: string;
  file: File;
  title: string;
  codec: string;
  durationMs: number | null;
}

interface AudioFileUploaderProps {
  items: QueuedAudioTrack[];
  onAddFiles: (files: FileList | File[]) => void;
  onUpdateTitle: (id: string, title: string) => void;
  onMoveItem: (id: string, direction: 'up' | 'down') => void;
  onRemoveItem: (id: string) => void;
}

const AUDIO_EXT_REGEX = /\.(wav|flac|mp3|ogg|opus|m4a|aac|aif|aiff|alac|wma)$/i;

export function isSupportedAudioFile(file: File): boolean {
  return file.type.startsWith('audio/') || AUDIO_EXT_REGEX.test(file.name);
}

export function extractCodecFromFile(file: File): string {
  const match = file.name.match(/\.([a-z0-9]+)$/i);
  const ext = match ? match[1].toUpperCase() : '';
  if (ext === 'AIF') return 'AIFF';
  if (ext === 'M4A' || ext === 'MP4') return 'ALAC/AAC';
  return ext || 'WAV';
}

export function deriveTrackTitleFromFilename(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^/.]+$/, '');
  const cleaned = withoutExt
    .replace(/^\d{1,3}[\s._-]+/, '')
    .replace(/_/g, ' ')
    .trim();
  return cleaned || withoutExt;
}

export function readAudioDurationMs(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const audio = new Audio();
    audio.preload = 'metadata';

    const finish = (durationMs: number | null) => {
      audio.removeAttribute('src');
      audio.load();
      URL.revokeObjectURL(objectUrl);
      resolve(durationMs);
    };

    const timer = window.setTimeout(() => finish(null), 3500);

    audio.addEventListener(
      'loadedmetadata',
      () => {
        window.clearTimeout(timer);
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          finish(Math.round(audio.duration * 1000));
        } else {
          finish(null);
        }
      },
      { once: true }
    );

    audio.addEventListener(
      'error',
      () => {
        window.clearTimeout(timer);
        finish(null);
      },
      { once: true }
    );

    audio.src = objectUrl;
  });
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return '--:--';
  const totalSec = Math.round(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${String(sec).padStart(2, '0')}`;
}

export function AudioFileUploader({
  items,
  onAddFiles,
  onUpdateTitle,
  onMoveItem,
  onRemoveItem,
}: AudioFileUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  function handleDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }

  function handleDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      onAddFiles(e.dataTransfer.files);
    }
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        className={`rounded-xl border border-dashed transition-colors cursor-pointer flex flex-col items-center justify-center text-center px-4 py-4 ${
          isDragging
            ? 'border-[#E06D2B] bg-[#E06D2B]/10'
            : 'border-[#2A2A27] bg-[#121211] hover:border-[#3D3D38] hover:bg-[#161614]'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="audio/*,.flac,.wav,.mp3,.ogg,.opus,.m4a,.aac,.aif,.aiff,.alac"
          multiple
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              onAddFiles(e.target.files);
              e.target.value = '';
            }
          }}
          className="hidden"
        />

        <div className="flex items-center gap-2 text-sm font-medium text-[#F2EFE9]">
          {items.length > 0 ? (
            <FileAudio className="w-4 h-4 text-[#E06D2B]" />
          ) : (
            <Upload className="w-4 h-4 text-[#E06D2B]" />
          )}
          <span>
            {items.length > 0
              ? 'Drop more audio tracks, or click to add files'
              : 'Drop audio files here, or click to select tracks'}
          </span>
        </div>
        <p className="text-xs text-[#706D66] mt-1">
          Supports WAV, FLAC, MP3, M4A, OGG, AAC, and AIFF up to 150 MB per track
        </p>
      </div>

      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item, idx) => (
            <div
              key={item.id}
              className="p-2.5 rounded-lg bg-[#121211] border border-[#2A2A27] flex items-center gap-2.5"
            >
              <span className="w-6 text-center text-xs font-mono text-[#706D66] tabular-nums shrink-0">
                {String(idx + 1).padStart(2, '0')}
              </span>

              <div className="min-w-0 flex-1 space-y-1">
                <input
                  type="text"
                  value={item.title}
                  onChange={(e) => onUpdateTitle(item.id, e.target.value)}
                  placeholder={`Track ${idx + 1} title`}
                  aria-label={`Track title for ${item.file.name}`}
                  className="w-full px-2.5 py-1 rounded-md bg-[#1A1A18] border border-[#2A2A27] text-xs font-medium text-[#F2EFE9] focus:outline-none focus:border-[#E06D2B]"
                />
                <div className="flex items-center gap-2 text-[11px] font-mono text-[#706D66] tabular-nums truncate">
                  <span className="truncate">{item.file.name}</span>
                  <span>·</span>
                  <span className="text-[#9E9B93] shrink-0">{item.codec}</span>
                  <span>·</span>
                  <span className="shrink-0">{formatDuration(item.durationMs)}</span>
                  <span>·</span>
                  <span className="shrink-0">{formatFileSize(item.file.size)}</span>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => onMoveItem(item.id, 'up')}
                  disabled={idx === 0}
                  aria-label={`Move ${item.file.name} up`}
                  className="p-1.5 rounded-md text-[#9E9B93] hover:text-[#F2EFE9] hover:bg-[#1A1A18] disabled:opacity-30 cursor-pointer disabled:cursor-default"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onMoveItem(item.id, 'down')}
                  disabled={idx === items.length - 1}
                  aria-label={`Move ${item.file.name} down`}
                  className="p-1.5 rounded-md text-[#9E9B93] hover:text-[#F2EFE9] hover:bg-[#1A1A18] disabled:opacity-30 cursor-pointer disabled:cursor-default"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveItem(item.id)}
                  aria-label={`Remove ${item.file.name}`}
                  className="p-1.5 rounded-md text-[#9E9B93] hover:text-[#FCA5A5] hover:bg-[#1A1A18] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
