import { useRef, useState, type DragEvent } from 'react';
import { ImagePlus, Upload, X } from 'lucide-react';
import type { LinerNotePageType } from '../../packages/shared/src/types';

export interface QueuedSleeveImage {
  id: string;
  file: File;
  previewUrl: string;
  pageType: LinerNotePageType;
}

interface SleeveImageUploaderProps {
  items: QueuedSleeveImage[];
  onAddFiles: (files: FileList | File[]) => void;
  onUpdatePageType: (id: string, pageType: LinerNotePageType) => void;
  onRemoveItem: (id: string) => void;
  compact?: boolean;
}

export const SLEEVE_PAGE_TYPE_OPTIONS: Array<{
  value: LinerNotePageType;
  label: string;
}> = [
  { value: 'front_cover', label: 'Front Sleeve / Cover' },
  { value: 'back_cover', label: 'Back Sleeve' },
  { value: 'gatefold', label: 'Gatefold Spread' },
  { value: 'booklet', label: 'Insert Booklet' },
  { value: 'j_card', label: 'Cassette J-Card' },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function SleeveImageUploader({
  items,
  onAddFiles,
  onUpdatePageType,
  onRemoveItem,
  compact = false,
}: SleeveImageUploaderProps) {
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
        className={`rounded-xl border border-dashed transition-colors cursor-pointer flex flex-col items-center justify-center text-center ${
          compact ? 'px-4 py-4' : 'px-6 py-7'
        } ${
          isDragging
            ? 'border-[#E06D2B] bg-[#E06D2B]/10'
            : 'border-[#2A2A27] bg-[#121211] hover:border-[#3D3D38] hover:bg-[#161614]'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
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
            <ImagePlus className="w-4 h-4 text-[#E06D2B]" />
          ) : (
            <Upload className="w-4 h-4 text-[#E06D2B]" />
          )}
          <span>
            {items.length > 0
              ? 'Drop more sleeve or gatefold images, or click to add'
              : 'Drop sleeve, gatefold, or booklet images here'}
          </span>
        </div>
        <p className="text-xs text-[#706D66] mt-1">
          Supports JPG, PNG, and WebP up to 15 MB per scan · Multiple files supported
        </p>
      </div>

      {items.length > 0 && (
        <div className="space-y-2">
          {items.map((item) => (
            <div
              key={item.id}
              className="p-2.5 rounded-lg bg-[#121211] border border-[#2A2A27] flex flex-wrap sm:flex-nowrap items-center justify-between gap-3"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <img
                  src={item.previewUrl}
                  alt={item.file.name}
                  className="w-12 h-12 rounded-md object-cover border border-[#2A2A27] shrink-0 bg-[#1A1A18]"
                />
                <div className="min-w-0">
                  <div className="text-xs font-medium text-[#F2EFE9] truncate">
                    {item.file.name}
                  </div>
                  <div className="text-[11px] font-mono text-[#706D66] tabular-nums">
                    {formatFileSize(item.file.size)}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={item.pageType}
                  onChange={(e) =>
                    onUpdatePageType(item.id, e.target.value as LinerNotePageType)
                  }
                  aria-label={`Image role for ${item.file.name}`}
                  className="px-2.5 py-1.5 rounded-md bg-[#1A1A18] border border-[#2A2A27] text-xs text-[#F2EFE9] focus:outline-none focus:border-[#E06D2B]"
                >
                  {SLEEVE_PAGE_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>

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
