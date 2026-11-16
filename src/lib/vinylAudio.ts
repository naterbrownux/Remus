export interface RmsPoint {
  timeSec: number;
  dbFs: number;
}

export interface SilenceValley {
  startSec: number;
  endSec: number;
  minDbFs: number;
}

export interface AudioAnalysisSummary {
  durationSec: number;
  peaks: number[];
  rmsEnvelope: RmsPoint[];
  candidateValleys: SilenceValley[];
}

export function encodePcmWav(
  channels: Float32Array[],
  sampleRate: number
): Blob {
  const numChannels = Math.max(1, Math.min(2, channels.length));
  const left = channels[0];
  const right = numChannels > 1 ? channels[1] : channels[0];
  const length = left.length;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const dataByteSize = length * blockAlign;
  const buffer = new ArrayBuffer(44 + dataByteSize);
  const view = new DataView(buffer);

  const writeStr = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataByteSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataByteSize, true);

  let offset = 44;
  for (let i = 0; i < length; i++) {
    const l = Math.max(-1, Math.min(1, left[i]));
    view.setInt16(offset, l < 0 ? l * 0x8000 : l * 0x7fff, true);
    offset += 2;
    if (numChannels > 1) {
      const r = Math.max(-1, Math.min(1, right[i]));
      view.setInt16(offset, r < 0 ? r * 0x8000 : r * 0x7fff, true);
      offset += 2;
    }
  }

  return new Blob([buffer], { type: 'audio/wav' });
}

export function sliceAudioBufferToWav(
  audioBuffer: AudioBuffer,
  startSec: number,
  endSec: number
): Blob {
  const sr = audioBuffer.sampleRate;
  const startSample = Math.max(0, Math.floor(startSec * sr));
  const endSample = Math.min(audioBuffer.length, Math.ceil(endSec * sr));
  const safeEnd = Math.max(startSample + Math.min(sr, 4410), endSample);

  const channels: Float32Array[] = [];
  const channelCount = Math.min(2, audioBuffer.numberOfChannels);
  for (let c = 0; c < channelCount; c++) {
    channels.push(audioBuffer.getChannelData(c).slice(startSample, Math.min(audioBuffer.length, safeEnd)));
  }
  return encodePcmWav(channels, sr);
}

export function analyzeAudioBuffer(
  audioBuffer: AudioBuffer,
  barCount = 96
): AudioAnalysisSummary {
  const sr = audioBuffer.sampleRate;
  const durationSec = audioBuffer.duration;
  const left = audioBuffer.getChannelData(0);
  const right = audioBuffer.numberOfChannels > 1 ? audioBuffer.getChannelData(1) : left;

  // Waveform bars
  const samplesPerBar = Math.max(1, Math.floor(left.length / barCount));
  const peaks: number[] = [];
  for (let b = 0; b < barCount; b++) {
    const start = b * samplesPerBar;
    const end = Math.min(left.length, start + samplesPerBar);
    const step = Math.max(1, Math.floor((end - start) / 64));
    let maxAmp = 0;
    for (let i = start; i < end; i += step) {
      const amp = Math.max(Math.abs(left[i]), Math.abs(right[i]));
      if (amp > maxAmp) maxAmp = amp;
    }
    peaks.push(Number(maxAmp.toFixed(4)));
  }

  // RMS envelope in 0.25s windows (sampled up to 240 points for Gemini)
  const windowSec = Math.max(0.25, durationSec / 220);
  const windowSamples = Math.max(256, Math.floor(windowSec * sr));
  const rmsEnvelope: RmsPoint[] = [];

  for (let start = 0; start < left.length; start += windowSamples) {
    const end = Math.min(left.length, start + windowSamples);
    const step = Math.max(1, Math.floor((end - start) / 128));
    let sumSq = 0;
    let count = 0;
    for (let i = start; i < end; i += step) {
      const mono = (left[i] + right[i]) * 0.5;
      sumSq += mono * mono;
      count++;
    }
    const rms = Math.sqrt(sumSq / Math.max(1, count));
    const dbFs = Number(Math.max(-90, 20 * Math.log10(rms + 1e-5)).toFixed(1));
    rmsEnvelope.push({
      timeSec: Number((start / sr).toFixed(2)),
      dbFs,
    });
  }

  // Detect silence / low-energy inter-track valleys
  const sortedDbs = [...rmsEnvelope].map((p) => p.dbFs).sort((a, b) => a - b);
  const medianDb = sortedDbs[Math.floor(sortedDbs.length * 0.5)] ?? -24;
  const silenceThreshold = Math.min(-30, medianDb - 10);

  const candidateValleys: SilenceValley[] = [];
  let inValley = false;
  let valleyStart = 0;
  let minDb = 0;

  for (let i = 0; i < rmsEnvelope.length; i++) {
    const pt = rmsEnvelope[i];
    if (pt.dbFs <= silenceThreshold) {
      if (!inValley) {
        inValley = true;
        valleyStart = pt.timeSec;
        minDb = pt.dbFs;
      } else {
        minDb = Math.min(minDb, pt.dbFs);
      }
    } else if (inValley) {
      const endSec = pt.timeSec;
      if (endSec - valleyStart >= 0.45) {
        candidateValleys.push({
          startSec: Number(valleyStart.toFixed(2)),
          endSec: Number(endSec.toFixed(2)),
          minDbFs: minDb,
        });
      }
      inValley = false;
    }
  }

  return {
    durationSec: Number(durationSec.toFixed(2)),
    peaks,
    rmsEnvelope,
    candidateValleys,
  };
}
