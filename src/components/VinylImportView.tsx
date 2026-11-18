import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Mic,
  Play,
  Plus,
  Sparkles,
  Square,
  Trash2,
  Upload,
  Volume2,
} from 'lucide-react';
import type { AlbumWithDetails, StorageRoot } from '../../packages/shared/src/types';
import { formatSeconds } from '../lib/formatters';
import {
  analyzeAudioBuffer,
  encodePcmWav,
  sliceAudioBufferToWav,
  type AudioAnalysisSummary,
} from '../lib/vinylAudio';

interface VinylImportViewProps {
  storageRoots: StorageRoot[];
  onImported: (album: AlbumWithDetails) => Promise<void>;
}

interface VinylTrackRow {
  side: string;
  title: string;
  startSec: number;
  endSec: number;
  confidence?: number;
  reasoning?: string;
}

const FORMAT_OPTIONS = [
  { id: 'WAV_96_24', label: 'WAV PCM (24/96)', codec: 'WAV', sampleRate: 96000, bitDepth: 24 },
  { id: 'FLAC_96_24', label: 'FLAC (24/96)', codec: 'FLAC', sampleRate: 96000, bitDepth: 24 },
  { id: 'WAV_192_24', label: 'WAV PCM (24/192)', codec: 'WAV', sampleRate: 192000, bitDepth: 24 },
  { id: 'WAV_44_16', label: 'WAV PCM (16/44.1)', codec: 'WAV', sampleRate: 44100, bitDepth: 16 },
] as const;

export function VinylImportView({ storageRoots, onImported }: VinylImportViewProps) {
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [devicePermissionGranted, setDevicePermissionGranted] = useState(false);
  const [deviceError, setDeviceError] = useState<string | null>(null);

  const [targetRootId, setTargetRootId] = useState(
    storageRoots.find((r) => r.default_media_format === 'vinyl')?.id || storageRoots[0]?.id || ''
  );
  const [formatKey, setFormatKey] = useState<string>('WAV_96_24');
  const [rpm, setRpm] = useState('33⅓ RPM · RIAA');
  const [sideLabel, setSideLabel] = useState('Side A');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [releaseYear, setReleaseYear] = useState('');
  const [catalogNumber, setCatalogNumber] = useState('');
  const [recordLabel, setRecordLabel] = useState('');
  const [cartridgeNotes, setCartridgeNotes] = useState('');

  // Live capture & loaded audio state
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSec, setRecordingSec] = useState(0);
  const [inputLevel, setInputLevel] = useState<{ left: number; right: number }>({
    left: 0,
    right: 0,
  });

  const [capturedBuffer, setCapturedBuffer] = useState<AudioBuffer | null>(null);
  const [capturedWavBlob, setCapturedWavBlob] = useState<Blob | null>(null);
  const [capturedSourceLabel, setCapturedSourceLabel] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<AudioAnalysisSummary | null>(null);

  const [tracks, setTracks] = useState<VinylTrackRow[]>([]);

  const [detectingBreaks, setDetectingBreaks] = useState(false);
  const [geminiNotes, setGeminiNotes] = useState<string | null>(null);
  const [geminiError, setGeminiError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importedAlbum, setImportedAlbum] = useState<AlbumWithDetails | null>(null);

  const [previewPlayingIdx, setPreviewPlayingIdx] = useState<number | 'full' | null>(null);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserLRef = useRef<AnalyserNode | null>(null);
  const analyserRRef = useRef<AnalyserNode | null>(null);
  const meterRafRef = useRef<number | null>(null);
  const recTimerRef = useRef<number | null>(null);
  const recordedLeftRef = useRef<Float32Array[]>([]);
  const recordedRightRef = useRef<Float32Array[]>([]);
  const isRecordingRef = useRef(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refreshDevices = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const inputs = devices.filter((d) => d.kind === 'audioinput');
      setAudioDevices(inputs);
      if (inputs.length > 0 && !selectedDeviceId) {
        const usbPref =
          inputs.find((d) => /usb|turntable|phono|interface|scarlett|focusrite|behringer|rega|audio-technica/i.test(d.label)) ||
          inputs[0];
        setSelectedDeviceId(usbPref.deviceId);
      }
    } catch {
      // Ignore enumerate failure
    }
  }, [selectedDeviceId]);

  useEffect(() => {
    refreshDevices();
    const handler = () => refreshDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', handler);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', handler);
    };
  }, [refreshDevices]);

  const stopAudioEngine = useCallback(() => {
    isRecordingRef.current = false;
    setIsRecording(false);
    setIsMonitoring(false);
    if (meterRafRef.current) {
      cancelAnimationFrame(meterRafRef.current);
      meterRafRef.current = null;
    }
    if (recTimerRef.current) {
      clearInterval(recTimerRef.current);
      recTimerRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setInputLevel({ left: 0, right: 0 });
  }, []);

  useEffect(() => {
    return () => {
      stopAudioEngine();
      if (previewAudioRef.current) {
        previewAudioRef.current.pause();
        previewAudioRef.current = null;
      }
    };
  }, [stopAudioEngine]);

  async function connectAudioInterface(deviceIdOverride?: string) {
    setDeviceError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setDeviceError('Browser audio capture API is unavailable in this context.');
      return null;
    }

    stopAudioEngine();

    try {
      const targetId = deviceIdOverride || selectedDeviceId;
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: targetId ? { exact: targetId } : undefined,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 2,
        },
      });
      streamRef.current = stream;
      setDevicePermissionGranted(true);
      await refreshDevices();

      const ctx = new AudioContext();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const splitter = ctx.createChannelSplitter(2);
      const analyserL = ctx.createAnalyser();
      const analyserR = ctx.createAnalyser();
      analyserL.fftSize = 256;
      analyserR.fftSize = 256;
      analyserLRef.current = analyserL;
      analyserRRef.current = analyserR;

      source.connect(splitter);
      splitter.connect(analyserL, 0);
      splitter.connect(analyserR, source.channelCount > 1 ? 1 : 0);

      // ScriptProcessor captures raw stereo float frames for WAV encoding
      const processor = ctx.createScriptProcessor(4096, 2, 2);
      const silentGain = ctx.createGain();
      silentGain.gain.value = 0;

      source.connect(processor);
      processor.connect(silentGain);
      silentGain.connect(ctx.destination);

      processor.onaudioprocess = (ev) => {
        if (!isRecordingRef.current) return;
        const chL = ev.inputBuffer.getChannelData(0);
        const chR =
          ev.inputBuffer.numberOfChannels > 1
            ? ev.inputBuffer.getChannelData(1)
            : chL;
        recordedLeftRef.current.push(new Float32Array(chL));
        recordedRightRef.current.push(new Float32Array(chR));
      };

      setIsMonitoring(true);

      const bufL = new Uint8Array(analyserL.frequencyBinCount);
      const bufR = new Uint8Array(analyserR.frequencyBinCount);
      const tickMeter = () => {
        if (!analyserLRef.current || !analyserRRef.current) return;
        analyserLRef.current.getByteTimeDomainData(bufL);
        analyserRRef.current.getByteTimeDomainData(bufR);
        let maxL = 0;
        let maxR = 0;
        for (let i = 0; i < bufL.length; i++) {
          maxL = Math.max(maxL, Math.abs(bufL[i] - 128) / 128);
          maxR = Math.max(maxR, Math.abs(bufR[i] - 128) / 128);
        }
        setInputLevel({ left: Math.min(1, maxL * 1.4), right: Math.min(1, maxR * 1.4) });
        meterRafRef.current = requestAnimationFrame(tickMeter);
      };
      meterRafRef.current = requestAnimationFrame(tickMeter);

      return ctx;
    } catch (err) {
      setDeviceError(
        err instanceof Error
          ? err.message
          : 'Could not open audio interface. Check browser microphone/USB audio permission.'
      );
      return null;
    }
  }

  async function startRecordingCapture() {
    setGeminiNotes(null);
    setGeminiError(null);
    setImportError(null);

    let ctx = audioCtxRef.current;
    if (!ctx || !isMonitoring) {
      ctx = await connectAudioInterface();
      if (!ctx) return;
    }
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    recordedLeftRef.current = [];
    recordedRightRef.current = [];
    isRecordingRef.current = true;
    setIsRecording(true);
    setRecordingSec(0);

    if (recTimerRef.current) clearInterval(recTimerRef.current);
    const startedAt = Date.now();
    recTimerRef.current = window.setInterval(() => {
      setRecordingSec(Math.floor((Date.now() - startedAt) / 1000));
    }, 250);
  }

  async function stopRecordingCapture() {
    if (!isRecordingRef.current) return;
    isRecordingRef.current = false;
    setIsRecording(false);
    if (recTimerRef.current) {
      clearInterval(recTimerRef.current);
      recTimerRef.current = null;
    }

    const ctx = audioCtxRef.current;
    const sampleRate = ctx?.sampleRate || 44100;
    const leftChunks = recordedLeftRef.current;
    const rightChunks = recordedRightRef.current;
    const totalSamples = leftChunks.reduce((sum, c) => sum + c.length, 0);

    if (totalSamples < sampleRate * 0.4) {
      setDeviceError('Recording was too short. Capture at least 1 second of vinyl audio.');
      return;
    }

    const mergedL = new Float32Array(totalSamples);
    const mergedR = new Float32Array(totalSamples);
    let offset = 0;
    for (let i = 0; i < leftChunks.length; i++) {
      mergedL.set(leftChunks[i], offset);
      mergedR.set(rightChunks[i], offset);
      offset += leftChunks[i].length;
    }

    const decodeCtx = new AudioContext({ sampleRate });
    const audioBuf = decodeCtx.createBuffer(2, totalSamples, sampleRate);
    audioBuf.copyToChannel(mergedL, 0);
    audioBuf.copyToChannel(mergedR, 1);
    decodeCtx.close().catch(() => {});

    const wavBlob = encodePcmWav([mergedL, mergedR], sampleRate);
    const summary = analyzeAudioBuffer(audioBuf);
    const activeDeviceName =
      audioDevices.find((d) => d.deviceId === selectedDeviceId)?.label || 'USB Audio Interface';

    setCapturedBuffer(audioBuf);
    setCapturedWavBlob(wavBlob);
    setCapturedSourceLabel(`Live Capture · ${activeDeviceName}`);
    setAnalysis(summary);

    setTracks([
      {
        side: sideLabel.replace('Side ', '').slice(0, 1) || 'A',
        title: `${sideLabel} — Full Capture`,
        startSec: 0,
        endSec: summary.durationSec,
      },
    ]);
  }

  async function handleLoadAudioFile(file: File | null) {
    if (!file) return;
    setDeviceError(null);
    setGeminiNotes(null);
    setGeminiError(null);
    setImportError(null);

    try {
      const arrayBuf = await file.arrayBuffer();
      const ctx = new AudioContext();
      const decoded = await ctx.decodeAudioData(arrayBuf.slice(0));
      ctx.close().catch(() => {});

      const summary = analyzeAudioBuffer(decoded);
      setCapturedBuffer(decoded);
      setCapturedWavBlob(file);
      setCapturedSourceLabel(file.name);
      setAnalysis(summary);

      setTracks([
        {
          side: sideLabel.replace('Side ', '').slice(0, 1) || 'A',
          title: file.name.replace(/\.[^.]+$/, ''),
          startSec: 0,
          endSec: summary.durationSec,
        },
      ]);
    } catch {
      setDeviceError('Could not decode audio file. Please select a valid WAV, FLAC, or MP3 file.');
    }
  }

  async function handleDetectTrackBreaks() {
    if (!analysis || !capturedWavBlob) return;
    setDetectingBreaks(true);
    setGeminiError(null);
    setGeminiNotes(null);

    try {
      const formData = new FormData();
      if (capturedWavBlob.size <= 12 * 1024 * 1024) {
        formData.append('audio', capturedWavBlob, 'vinyl_side.wav');
      }
      formData.append(
        'metadata',
        JSON.stringify({
          durationSec: analysis.durationSec,
          albumTitle: title,
          artist,
          side: sideLabel,
          rpm,
          expectedTrackTitles: tracks.map((t) => t.title).filter(Boolean),
          rmsEnvelope: analysis.rmsEnvelope,
          candidateValleys: analysis.candidateValleys,
        })
      );

      const res = await fetch('/api/vinyl/detect-breaks', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Gemini track-break analysis failed.');
      }

      if (Array.isArray(data.tracks) && data.tracks.length > 0) {
        setTracks(
          data.tracks.map(
            (t: {
              side?: string;
              title: string;
              startSec: number;
              endSec: number;
              confidence?: number;
              reasoning?: string;
            }) => ({
              side: t.side || 'A',
              title: t.title,
              startSec: t.startSec,
              endSec: t.endSec,
              confidence: t.confidence,
              reasoning: t.reasoning,
            })
          )
        );
      }
      if (data.notes) {
        setGeminiNotes(data.notes);
      }
    } catch (err) {
      setGeminiError(
        err instanceof Error ? err.message : 'Unable to identify track breaks with Gemini.'
      );
    } finally {
      setDetectingBreaks(false);
    }
  }

  function togglePreviewSegment(idx: number | 'full', startSec = 0, endSec?: number) {
    if (!capturedWavBlob) return;
    if (previewPlayingIdx === idx && previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
      setPreviewPlayingIdx(null);
      return;
    }

    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      previewAudioRef.current = null;
    }

    const blobToPlay =
      idx === 'full' || !capturedBuffer
        ? capturedWavBlob
        : sliceAudioBufferToWav(
            capturedBuffer,
            startSec,
            endSec ?? capturedBuffer.duration
          );

    const url = URL.createObjectURL(blobToPlay);
    const audio = new Audio(url);
    previewAudioRef.current = audio;
    setPreviewPlayingIdx(idx);
    audio.onended = () => {
      URL.revokeObjectURL(url);
      setPreviewPlayingIdx(null);
    };
    audio.play().catch(() => {
      setPreviewPlayingIdx(null);
    });
  }

  function addTrackRow() {
    const last = tracks[tracks.length - 1];
    const start = last ? last.endSec : 0;
    const maxDur = analysis?.durationSec || start + 240;
    const end = Math.max(start + 10, maxDur);
    setTracks((prev) => [
      ...prev,
      {
        side: sideLabel.replace('Side ', '').slice(0, 1) || 'A',
        title: `Track ${prev.length + 1}`,
        startSec: Number(start.toFixed(1)),
        endSec: Number(end.toFixed(1)),
      },
    ]);
  }

  async function startVinylImport() {
    if (!title.trim() || !artist.trim() || tracks.length === 0) return;
    setImporting(true);
    setImportError(null);
    setImportedAlbum(null);

    try {
      const fmt =
        FORMAT_OPTIONS.find((f) => f.id === formatKey) || FORMAT_OPTIONS[0];
      const activeDeviceName =
        audioDevices.find((d) => d.deviceId === selectedDeviceId)?.label ||
        (capturedSourceLabel ? 'External Audio File' : 'USB Audio Interface');

      const formData = new FormData();
      const serializedTracks = tracks.map((tr, idx) => {
        const durSec = Math.max(1, tr.endSec - tr.startSec);
        if (capturedBuffer) {
          const slicedWav = sliceAudioBufferToWav(capturedBuffer, tr.startSec, tr.endSec);
          formData.append('tracksAudio', slicedWav, `track_${idx + 1}.wav`);
        }
        return {
          side: tr.side,
          title: tr.title,
          startSec: tr.startSec,
          endSec: tr.endSec,
          durationMs: Math.round(durSec * 1000),
          hasAudio: Boolean(capturedBuffer),
        };
      });

      formData.append(
        'metadata',
        JSON.stringify({
          storage_root_id: targetRootId,
          title,
          artist,
          release_year: Number(releaseYear) || new Date().getFullYear(),
          catalog_number: catalogNumber,
          record_label: recordLabel,
          codec: fmt.codec,
          sample_rate: fmt.sampleRate,
          bit_depth: fmt.bitDepth,
          rpm,
          input_device: activeDeviceName,
          cartridge_notes: cartridgeNotes,
          tracks: serializedTracks,
        })
      );

      const res = await fetch('/api/vinyl/import', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Vinyl import failed.');
      }

      setImportedAlbum(data as AlbumWithDetails);
      await onImported(data as AlbumWithDetails);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Unable to archive vinyl release.');
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#F2EFE9]">Vinyl Import</h1>
        </div>

        <button
          type="button"
          disabled={importing || isRecording || !title.trim() || !artist.trim() || tracks.length === 0}
          onClick={startVinylImport}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#E06D2B] hover:bg-[#EB7B3B] text-sm font-semibold text-[#121211] transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
        >
          <Play className="w-4 h-4 fill-current" />
          <span>{importing ? 'Archiving Vinyl...' : 'Start Import'}</span>
        </button>
      </div>

      {importError && (
        <div className="p-3.5 rounded-xl bg-[#DC2626]/10 border border-[#DC2626]/30 text-xs text-[#FCA5A5]">
          {importError}
        </div>
      )}

      {/* Interface Capture & Vinyl Metadata */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 p-5 rounded-xl bg-[#161614] border border-[#2A2A27] space-y-4">
          <div className="space-y-3">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs text-[#9E9B93]">
                  USB Turntable / Audio Interface
                </label>
                <button
                  type="button"
                  onClick={() => connectAudioInterface()}
                  className="text-[11px] font-medium text-[#E06D2B] hover:underline cursor-pointer"
                >
                  {devicePermissionGranted ? 'Reconnect Input' : 'Enable USB Input'}
                </button>
              </div>
              <select
                value={selectedDeviceId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setSelectedDeviceId(nextId);
                  if (isMonitoring) {
                    connectAudioInterface(nextId);
                  }
                }}
                className="w-full px-3 py-2 rounded-lg bg-[#121211] border border-[#2A2A27] text-sm text-[#F2EFE9]"
              >
                {audioDevices.length === 0 ? (
                  <option value="">Default System Audio Input (USB / Line-In)</option>
                ) : (
                  audioDevices.map((dev, idx) => (
                    <option key={dev.deviceId || idx} value={dev.deviceId}>
                      {dev.label || `Audio Interface Input #${idx + 1}`}
                    </option>
                  ))
                )}
              </select>
            </div>

            {/* Live Input Meter + Recording / File Load Bar */}
            <div className="p-3 rounded-lg bg-[#121211] border border-[#2A2A27] space-y-2.5">
              <div className="flex items-center justify-between text-[11px] font-mono text-[#9E9B93] tabular-nums">
                <span>
                  {isRecording
                    ? `CAPTURING · ${formatSeconds(recordingSec)}`
                    : isMonitoring
                      ? 'INPUT ARMED · STEREO ADC'
                      : 'INPUT STANDBY'}
                </span>
                <span>{rpm}</span>
              </div>

              {/* L / R Stereo Peak Bars */}
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-[#706D66] w-3">L</span>
                  <div className="flex-1 h-1.5 rounded-full bg-[#1E1E1B] overflow-hidden">
                    <div
                      className="h-full bg-[#E06D2B] transition-all duration-75"
                      style={{ width: `${Math.round(inputLevel.left * 100)}%` }}
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono text-[#706D66] w-3">R</span>
                  <div className="flex-1 h-1.5 rounded-full bg-[#1E1E1B] overflow-hidden">
                    <div
                      className="h-full bg-[#E06D2B] transition-all duration-75"
                      style={{ width: `${Math.round(inputLevel.right * 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                {isRecording ? (
                  <button
                    type="button"
                    onClick={stopRecordingCapture}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#DC2626] hover:bg-[#EF4444] text-xs font-semibold text-white cursor-pointer whitespace-nowrap"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                    <span>Stop Capture ({formatSeconds(recordingSec)})</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={startRecordingCapture}
                    className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-[#22221F] hover:bg-[#2C2C28] border border-[#2A2A27] text-xs font-medium text-[#F2EFE9] cursor-pointer whitespace-nowrap"
                  >
                    <Mic className="w-3.5 h-3.5 text-[#E06D2B]" />
                    <span>Record Side</span>
                  </button>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  onChange={(e) => {
                    handleLoadAudioFile(e.target.files?.[0] || null);
                    e.target.value = '';
                  }}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={isRecording}
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border border-[#2A2A27] text-xs font-medium text-[#C9C5BC] hover:text-[#F2EFE9] hover:bg-[#1A1A18] cursor-pointer disabled:opacity-40 whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5 text-[#E06D2B]" />
                  <span>Load Recording</span>
                </button>
              </div>

              {deviceError && (
                <div className="text-[11px] text-[#FCA5A5] leading-relaxed">
                  {deviceError}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#9E9B93] mb-1">Target Volume</label>
                <select
                  value={targetRootId}
                  onChange={(e) => setTargetRootId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#121211] border border-[#2A2A27] text-sm text-[#F2EFE9]"
                >
                  {storageRoots.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#9E9B93] mb-1">Lossless Format</label>
                <select
                  value={formatKey}
                  onChange={(e) => setFormatKey(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#121211] border border-[#2A2A27] text-sm font-mono text-[#F2EFE9]"
                >
                  {FORMAT_OPTIONS.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-[#9E9B93] mb-1">Speed & Equalization</label>
                <select
                  value={rpm}
                  onChange={(e) => setRpm(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#121211] border border-[#2A2A27] text-sm text-[#F2EFE9]"
                >
                  <option value="33⅓ RPM · RIAA">33⅓ RPM · RIAA</option>
                  <option value="45 RPM · RIAA">45 RPM · RIAA</option>
                  <option value="78 RPM · Flat">78 RPM · Flat</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#9E9B93] mb-1">Disc Side</label>
                <select
                  value={sideLabel}
                  onChange={(e) => setSideLabel(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#121211] border border-[#2A2A27] text-sm text-[#F2EFE9]"
                >
                  <option value="Side A">Side A</option>
                  <option value="Side B">Side B</option>
                  <option value="Double LP (Sides A–D)">Double LP (Sides A–D)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs text-[#9E9B93] mb-1">Album Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Enter album title"
                className="w-full px-3 py-2 rounded-lg bg-[#121211] border border-[#2A2A27] text-sm text-[#F2EFE9]"
              />
            </div>

            <div>
              <label className="block text-xs text-[#9E9B93] mb-1">Artist</label>
              <input
                type="text"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder="Enter artist name"
                className="w-full px-3 py-2 rounded-lg bg-[#121211] border border-[#2A2A27] text-sm text-[#F2EFE9]"
              />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-[#9E9B93] mb-1">Year</label>
                <input
                  type="number"
                  value={releaseYear}
                  onChange={(e) => setReleaseYear(e.target.value)}
                  placeholder="YYYY"
                  className="w-full px-3 py-2 rounded-lg bg-[#121211] border border-[#2A2A27] text-sm font-mono text-[#F2EFE9]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#9E9B93] mb-1">Catalog #</label>
                <input
                  type="text"
                  value={catalogNumber}
                  onChange={(e) => setCatalogNumber(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-3 py-2 rounded-lg bg-[#121211] border border-[#2A2A27] text-sm font-mono text-[#F2EFE9]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#9E9B93] mb-1">Label</label>
                <input
                  type="text"
                  value={recordLabel}
                  onChange={(e) => setRecordLabel(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-3 py-2 rounded-lg bg-[#121211] border border-[#2A2A27] text-sm text-[#F2EFE9]"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-[#9E9B93] mb-1">
                Cartridge / Phono Stage Chain
              </label>
              <input
                type="text"
                value={cartridgeNotes}
                onChange={(e) => setCartridgeNotes(e.target.value)}
                placeholder="e.g. Ortofon 2M Bronze · Rega Fono MM"
                className="w-full px-3 py-2 rounded-lg bg-[#121211] border border-[#2A2A27] text-sm text-[#F2EFE9]"
              />
            </div>
          </div>
        </div>

        {/* Right Column: Capture Waveform, Gemini Track Break Detection & Tracklist */}
        <div className="lg:col-span-7 space-y-4">
          {/* Waveform & Gemini Track-Break Detection Card */}
          <div className="rounded-xl border border-[#2A2A27] bg-[#161614] p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-[#F2EFE9]">
                  Side Capture & Gemini Track-Break Detection
                </div>
                <div className="text-xs text-[#9E9B93] font-mono tabular-nums">
                  {analysis
                    ? `${capturedSourceLabel || 'Capture'} · ${formatSeconds(analysis.durationSec)} · ${analysis.candidateValleys.length} silence valleys`
                    : 'Record from your USB turntable / audio interface or load an audio file to detect track breaks'}
                </div>
              </div>

              <div className="flex items-center gap-2">
                {capturedWavBlob && (
                  <button
                    type="button"
                    onClick={() => togglePreviewSegment('full')}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#2A2A27] bg-[#1A1A18] hover:bg-[#22221F] text-xs font-medium text-[#F2EFE9] cursor-pointer whitespace-nowrap"
                  >
                    <Volume2 className="w-3.5 h-3.5 text-[#E06D2B]" />
                    <span>{previewPlayingIdx === 'full' ? 'Stop' : 'Preview Side'}</span>
                  </button>
                )}

                <button
                  type="button"
                  disabled={!analysis || detectingBreaks}
                  onClick={handleDetectTrackBreaks}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#E06D2B] hover:bg-[#EB7B3B] text-xs font-semibold text-[#121211] cursor-pointer disabled:opacity-40 whitespace-nowrap"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>
                    {detectingBreaks ? 'Analyzing Grooves...' : 'Detect Track Breaks with Gemini'}
                  </span>
                </button>
              </div>
            </div>

            {analysis && (
              <div className="relative h-16 rounded-lg bg-[#121211] border border-[#232320] px-2 flex items-center gap-[2px] overflow-hidden">
                {analysis.peaks.map((peak, idx) => {
                  const pct = Math.max(8, Math.round(peak * 100));
                  return (
                    <div
                      key={idx}
                      className="flex-1 bg-[#E06D2B]/70 rounded-xs"
                      style={{ height: `${pct}%` }}
                    />
                  );
                })}
                {tracks.slice(1).map((tr, i) => {
                  const leftPct =
                    analysis.durationSec > 0
                      ? Math.min(99, Math.max(1, (tr.startSec / analysis.durationSec) * 100))
                      : 0;
                  return (
                    <div
                      key={i}
                      title={`Break #${i + 2} @ ${formatSeconds(tr.startSec)}`}
                      className="absolute top-0 bottom-0 w-px bg-[#F2EFE9]"
                      style={{ left: `${leftPct}%` }}
                    />
                  );
                })}
              </div>
            )}

            {geminiNotes && (
              <div className="p-2.5 rounded-lg bg-[#121211] border border-[#232320] text-xs text-[#C9C5BC]">
                {geminiNotes}
              </div>
            )}

            {geminiError && (
              <div className="p-2.5 rounded-lg bg-[#DC2626]/10 border border-[#DC2626]/30 text-xs text-[#FCA5A5]">
                {geminiError}
              </div>
            )}
          </div>

          {/* Vinyl Tracklist & Split Points Table */}
          <div className="rounded-xl border border-[#2A2A27] bg-[#161614] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#2A2A27] flex items-center justify-between">
              <span className="text-sm font-semibold text-[#F2EFE9]">
                Vinyl Tracklist & Split Points ({tracks.length} Tracks)
              </span>
              <button
                type="button"
                onClick={addTrackRow}
                className="inline-flex items-center gap-1 text-xs text-[#E06D2B] hover:underline cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Track</span>
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-[#2A2A27] text-xs text-[#706D66]">
                    <th className="py-2.5 px-3 font-medium w-10">#</th>
                    <th className="py-2.5 px-3 font-medium w-14">Side</th>
                    <th className="py-2.5 px-3 font-medium">Track Title</th>
                    <th className="py-2.5 px-3 font-medium w-24">Start (s)</th>
                    <th className="py-2.5 px-3 font-medium w-24">End (s)</th>
                    <th className="py-2.5 px-3 font-medium text-right">Duration</th>
                    <th className="py-2.5 px-3 font-medium text-right w-20">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#232320] text-sm">
                  {tracks.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 px-4 text-center text-xs text-[#9E9B93]">
                        Record from your USB turntable, load an audio recording, or click{' '}
                        <span className="text-[#E06D2B]">Add Track</span> to enter track split points.
                      </td>
                    </tr>
                  ) : (
                    tracks.map((tr, idx) => {
                      const durSec = Math.max(0, tr.endSec - tr.startSec);
                      return (
                        <tr key={idx} className="h-11">
                          <td className="px-3 font-mono text-xs text-[#9E9B93] tabular-nums">
                            {String(idx + 1).padStart(2, '0')}
                          </td>
                          <td className="px-3">
                            <input
                              type="text"
                              value={tr.side}
                              onChange={(e) => {
                                const val = e.target.value;
                                setTracks((prev) =>
                                  prev.map((item, i) => (i === idx ? { ...item, side: val } : item))
                                );
                              }}
                              className="w-10 bg-transparent font-mono text-xs text-[#C9C5BC] focus:outline-none border-b border-transparent focus:border-[#E06D2B]"
                            />
                          </td>
                          <td className="px-3">
                            <input
                              type="text"
                              value={tr.title}
                              onChange={(e) => {
                                const val = e.target.value;
                                setTracks((prev) =>
                                  prev.map((item, i) => (i === idx ? { ...item, title: val } : item))
                                );
                              }}
                              className="w-full bg-transparent text-sm text-[#F2EFE9] focus:outline-none border-b border-transparent focus:border-[#E06D2B]"
                            />
                          </td>
                          <td className="px-3">
                            <input
                              type="number"
                              step="0.5"
                              min={0}
                              value={tr.startSec}
                              onChange={(e) => {
                                const val = Number(e.target.value) || 0;
                                setTracks((prev) =>
                                  prev.map((item, i) =>
                                    i === idx ? { ...item, startSec: val } : item
                                  )
                                );
                              }}
                              className="w-16 bg-transparent font-mono text-xs text-[#9E9B93] tabular-nums focus:outline-none border-b border-transparent focus:border-[#E06D2B]"
                            />
                          </td>
                          <td className="px-3">
                            <input
                              type="number"
                              step="0.5"
                              min={0}
                              value={tr.endSec}
                              onChange={(e) => {
                                const val = Number(e.target.value) || 0;
                                setTracks((prev) =>
                                  prev.map((item, i) => (i === idx ? { ...item, endSec: val } : item))
                                );
                              }}
                              className="w-16 bg-transparent font-mono text-xs text-[#9E9B93] tabular-nums focus:outline-none border-b border-transparent focus:border-[#E06D2B]"
                            />
                          </td>
                          <td className="px-3 font-mono text-xs text-[#9E9B93] text-right tabular-nums">
                            {formatSeconds(durSec)}
                          </td>
                          <td className="px-3 text-right">
                            <div className="inline-flex items-center gap-1.5">
                              {capturedBuffer && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    togglePreviewSegment(idx, tr.startSec, tr.endSec)
                                  }
                                  aria-label={`Preview ${tr.title}`}
                                  className={`p-1 cursor-pointer ${
                                    previewPlayingIdx === idx
                                      ? 'text-[#E06D2B]'
                                      : 'text-[#706D66] hover:text-[#F2EFE9]'
                                  }`}
                                >
                                  <Play className="w-3.5 h-3.5 fill-current" />
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() =>
                                  setTracks((prev) => prev.filter((_, i) => i !== idx))
                                }
                                aria-label="Remove vinyl track"
                                className="p-1 text-[#706D66] hover:text-[#FCA5A5] cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {importedAlbum && (
            <div className="p-4 rounded-xl bg-[#1A1A18] border border-[#E06D2B]/40 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-[#E06D2B] shrink-0" />
                <div>
                  <div className="text-sm font-semibold text-[#F2EFE9]">
                    {importedAlbum.title} archived to your Remus Library
                  </div>
                  <div className="text-xs text-[#9E9B93]">
                    {importedAlbum.tracks.length} vinyl tracks indexed with lossless audio.
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
