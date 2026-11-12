import fs from 'node:fs';
import path from 'node:path';

export type SoundProfile = 'jazz' | 'ambient' | 'tape' | 'cello' | 'piano';

const PROFILES: Record<SoundProfile, number[][]> = {
  jazz: [
    [220.0, 261.63, 329.63, 392.0, 493.88], // Am9
    [196.0, 246.94, 293.66, 349.23, 440.0], // G9sus
    [174.61, 220.0, 261.63, 329.63, 392.0], // Fmaj9
    [164.81, 207.65, 246.94, 311.13, 392.0], // E7#9
  ],
  ambient: [
    [146.83, 220.0, 293.66, 329.63, 440.0], // Dsus2
    [130.81, 196.0, 261.63, 329.63, 392.0], // Cmaj7
    [110.0, 164.81, 220.0, 261.63, 329.63], // Am7
    [123.47, 185.0, 246.94, 329.63, 370.0], // Bm11
  ],
  tape: [
    [196.0, 246.94, 293.66, 370.0], // Gmaj7
    [164.81, 196.0, 246.94, 293.66], // Em7
    [130.81, 164.81, 196.0, 246.94], // Cmaj7
    [146.83, 185.0, 220.0, 261.63], // D7
  ],
  cello: [
    [98.0, 146.83, 196.0, 246.94], // G2 open fifths
    [110.0, 164.81, 220.0, 261.63], // A2 minor
    [87.31, 130.81, 174.61, 220.0], // F2 major
    [98.0, 146.83, 196.0, 233.08], // Gm
  ],
  piano: [
    [261.63, 329.63, 392.0, 493.88],
    [220.0, 261.63, 329.63, 392.0],
    [174.61, 220.0, 261.63, 329.63],
    [196.0, 246.94, 293.66, 349.23],
  ],
};

/**
 * Generates a real 16-bit 44.1kHz Stereo PCM WAV file on disk.
 * Returns the exact duration in milliseconds.
 */
export function ensureWavFile(
  absolutePath: string,
  profile: SoundProfile,
  seedOffset = 0,
  durationSeconds = 14
): number {
  const dir = path.dirname(absolutePath);
  fs.mkdirSync(dir, { recursive: true });

  if (fs.existsSync(absolutePath) && fs.statSync(absolutePath).size > 44) {
    const bytes = fs.statSync(absolutePath).size - 44;
    return Math.round((bytes / (44100 * 4)) * 1000);
  }

  const sampleRate = 44100;
  const numChannels = 2;
  const bitsPerSample = 16;
  const totalSamples = sampleRate * durationSeconds;
  const dataByteSize = totalSamples * numChannels * (bitsPerSample / 8);
  const buffer = Buffer.alloc(44 + dataByteSize);

  // RIFF Header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataByteSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // PCM chunk size
  buffer.writeUInt16LE(1, 20); // AudioFormat = 1 (PCM)
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28);
  buffer.writeUInt16LE(numChannels * (bitsPerSample / 8), 32);
  buffer.writeUInt16LE(bitsPerSample, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataByteSize, 40);

  const chords = PROFILES[profile];
  const chordDuration = durationSeconds / chords.length;
  const transpose = Math.pow(2, ((seedOffset % 5) - 2) / 12);

  for (let i = 0; i < totalSamples; i++) {
    const t = i / sampleRate;
    const chordIdx = Math.min(chords.length - 1, Math.floor(t / chordDuration));
    const chord = chords[chordIdx];
    const localT = t - chordIdx * chordDuration;

    // Gentle attack and release per chord
    const chordEnv =
      Math.min(1, localT / 0.18) *
      Math.min(1, Math.max(0, (chordDuration - localT) / 0.25));
    // Overall fade in/out for gapless smoothness
    const masterEnv =
      Math.min(1, t / 0.08) *
      Math.min(1, Math.max(0, (durationSeconds - t) / 0.12));

    let sampleL = 0;
    let sampleR = 0;

    for (let n = 0; n < chord.length; n++) {
      const freq = chord[n] * transpose;
      const detune = 1 + (n % 2 === 0 ? 0.0014 : -0.0014);
      const fundamental = Math.sin(2 * Math.PI * freq * t);
      const harmonic2 =
        profile === 'cello'
          ? 0.28 * Math.sin(2 * Math.PI * freq * 2 * t)
          : 0.14 * Math.sin(2 * Math.PI * freq * 2 * t);
      const harmonic3 =
        profile === 'jazz' || profile === 'piano'
          ? 0.06 * Math.sin(2 * Math.PI * freq * 3 * t)
          : 0.03 * Math.sin(2 * Math.PI * freq * 3 * t);

      const voice = (fundamental + harmonic2 + harmonic3) / chord.length;
      const pan = n / Math.max(1, chord.length - 1); // 0..1
      sampleL += voice * (0.7 + 0.3 * (1 - pan));
      sampleR +=
        ((Math.sin(2 * Math.PI * freq * detune * t) + harmonic2) / chord.length) *
        (0.7 + 0.3 * pan);
    }

    // Subtle melody shimmer
    const melodyFreq = chord[(Math.floor(t * 2) + seedOffset) % chord.length] * 2 * transpose;
    const pulseT = (t * 2) % 1;
    const pulseEnv = Math.exp(-pulseT * 4.5);
    const melody = Math.sin(2 * Math.PI * melodyFreq * t) * pulseEnv * 0.12;

    // Subtle analog vinyl/tape warmth floor on vinyl/tape profiles
    const warmth =
      profile === 'tape' || profile === 'jazz'
        ? (Math.sin(i * 12.9898) * 43758.5453 - Math.floor(Math.sin(i * 12.9898) * 43758.5453) - 0.5) * 0.003
        : 0;

    const gain = 0.42 * chordEnv * masterEnv;
    const outL = Math.max(-0.95, Math.min(0.95, (sampleL + melody) * gain + warmth));
    const outR = Math.max(-0.95, Math.min(0.95, (sampleR + melody * 0.85) * gain + warmth));

    const offset = 44 + i * 4;
    buffer.writeInt16LE(Math.round(outL * 32767), offset);
    buffer.writeInt16LE(Math.round(outR * 32767), offset + 2);
  }

  fs.writeFileSync(absolutePath, buffer);
  return durationSeconds * 1000;
}
