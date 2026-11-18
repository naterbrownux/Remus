import {
  ArrowRight,
  CassetteTape,
  Disc3,
  FolderInput,
  Library,
  Plus,
  ScanText,
  Smartphone,
  X,
} from 'lucide-react';

interface WelcomeModalProps {
  onClose: () => void;
  onAddMusic: () => void;
  onOpenVinylImport: () => void;
  onOpenCassetteImport: () => void;
  onOpenMobileSync: () => void;
}

export function WelcomeModal({
  onClose,
  onAddMusic,
  onOpenVinylImport,
  onOpenCassetteImport,
  onOpenMobileSync,
}: WelcomeModalProps) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-heading"
    >
      <div className="w-full max-w-2xl bg-[#1A1A18] border border-[#2A2A27] rounded-2xl overflow-hidden shadow-2xl">
        <div className="px-6 py-5 border-b border-[#2A2A27] flex items-start justify-between gap-4 bg-[#161614]">
          <div className="space-y-1">
            <h2
              id="welcome-heading"
              className="font-display text-2xl font-semibold text-[#F2EFE9] tracking-tight"
            >
              Welcome to Remus
            </h2>
            <p className="text-sm text-[#C9C5BC] leading-relaxed">
              Your personal archive and lossless player for vinyl records, CDs, cassettes, and digital masters.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close welcome guide"
            className="p-1.5 text-[#9E9B93] hover:text-[#F2EFE9] rounded-md cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[78vh] overflow-y-auto">
          <div className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#9E9B93]">
              Main Features
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="p-4 rounded-xl bg-[#121211] border border-[#2A2A27] space-y-1.5">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#F2EFE9]">
                  <Library className="w-4 h-4 text-[#E06D2B] shrink-0" />
                  <span>Lossless Library & Playback</span>
                </div>
                <p className="text-xs text-[#9E9B93] leading-relaxed">
                  Organize releases by format, label, and catalog number. Upload WAV, FLAC, MP3, or M4A tracks and stream gaplessly or save offline.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#121211] border border-[#2A2A27] space-y-1.5">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#F2EFE9]">
                  <FolderInput className="w-4 h-4 text-[#E06D2B] shrink-0" />
                  <span>Vinyl, CD, Cassette & Digital Import</span>
                </div>
                <p className="text-xs text-[#9E9B93] leading-relaxed">
                  Record directly from a USB turntable, cassette deck, or audio interface with automatic track-break detection, import CDs, or upload digital audio files with track metadata.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#121211] border border-[#2A2A27] space-y-1.5">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#F2EFE9]">
                  <ScanText className="w-4 h-4 text-[#E06D2B] shrink-0" />
                  <span>Sleeve & Liner Note Scanning</span>
                </div>
                <p className="text-xs text-[#9E9B93] leading-relaxed">
                  Attach front covers, gatefolds, and booklet scans to any release, and extract readable liner notes and credits automatically.
                </p>
              </div>

              <div className="p-4 rounded-xl bg-[#121211] border border-[#2A2A27] space-y-1.5">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#F2EFE9]">
                  <Smartphone className="w-4 h-4 text-[#E06D2B] shrink-0" />
                  <span>Mobile Camera Sync</span>
                </div>
                <p className="text-xs text-[#9E9B93] leading-relaxed">
                  Scan a QR code with your phone to photograph record sleeves and inserts directly into your library over Wi-Fi.
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 rounded-xl bg-[#161614] border border-[#2A2A27] space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#9E9B93]">
              Where to Start
            </h3>
            <p className="text-xs text-[#C9C5BC] leading-relaxed">
              Start by adding your first release with audio files and cover art, or open Vinyl or Cassette Import to record directly from analog hardware.
            </p>
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={onAddMusic}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#22221F] hover:bg-[#2C2C28] border border-[#E06D2B]/45 text-xs font-medium text-[#F2EFE9] transition-colors cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5 text-[#E06D2B]" />
                <span>Add Your First Release</span>
              </button>
              <button
                type="button"
                onClick={onOpenVinylImport}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#22221F] hover:bg-[#2C2C28] border border-[#2A2A27] text-xs font-medium text-[#F2EFE9] transition-colors cursor-pointer whitespace-nowrap"
              >
                <Disc3 className="w-3.5 h-3.5 text-[#E06D2B]" />
                <span>Import Vinyl</span>
              </button>
              <button
                type="button"
                onClick={onOpenCassetteImport}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#22221F] hover:bg-[#2C2C28] border border-[#2A2A27] text-xs font-medium text-[#F2EFE9] transition-colors cursor-pointer whitespace-nowrap"
              >
                <CassetteTape className="w-3.5 h-3.5 text-[#E06D2B]" />
                <span>Import Cassette</span>
              </button>
              <button
                type="button"
                onClick={onOpenMobileSync}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#22221F] hover:bg-[#2C2C28] border border-[#2A2A27] text-xs font-medium text-[#F2EFE9] transition-colors cursor-pointer whitespace-nowrap"
              >
                <Smartphone className="w-3.5 h-3.5 text-[#E06D2B]" />
                <span>Pair Phone Camera</span>
              </button>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-[#2A2A27] bg-[#141412] flex flex-wrap items-center justify-between gap-4">
          <span className="text-xs text-[#706D66]">
            Reopen anytime from Welcome Guide in the sidebar
          </span>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#E06D2B] hover:bg-[#EB7B3B] active:bg-[#D15E1D] text-sm font-semibold text-[#121211] ring-1 ring-[#F5A370]/45 shadow-[0_8px_24px_-4px_rgba(224,109,43,0.45)] transition-all cursor-pointer whitespace-nowrap"
          >
            <span>Got It, Open Library</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
