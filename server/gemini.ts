import fs from 'node:fs';
import path from 'node:path';
import { GoogleGenAI, Type } from '@google/genai';

function getAiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export interface LinerNoteOcrResult {
  extractedText: string;
  confidenceScore: number;
  catalogNumber?: string | null;
  recordLabel?: string | null;
  pressingNotes?: string | null;
}

export async function extractLinerNotesWithGemini(
  imagePathOrRelativeUrl: string,
  pageType: string
): Promise<LinerNoteOcrResult> {
  const ai = getAiClient();
  if (!ai) {
    throw new Error(
      'AI text extraction is not configured for this workspace yet.'
    );
  }

  // Resolve local filesystem path cleanly
  const cleanRel = imagePathOrRelativeUrl.replace(/^\/+/, '');
  const resolvedPath = path.join(process.cwd(), cleanRel);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error('The selected scan image could not be found.');
  }

  const bytes = fs.readFileSync(resolvedPath);
  const ext = path.extname(resolvedPath).toLowerCase();
  const mimeType =
    ext === '.png'
      ? 'image/png'
      : ext === '.webp'
        ? 'image/webp'
        : 'image/jpeg';

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: {
      parts: [
        {
          inlineData: {
            mimeType,
            data: bytes.toString('base64'),
          },
        },
        {
          text: `You are an archival physical media librarian for Remus. Transcribe all legible text, track credits, session personnel, recording dates, catalog numbers, record labels, and mastering notes visible in this ${pageType} scan. Preserve line breaks naturally.`,
        },
      ],
    },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          extractedText: {
            type: Type.STRING,
            description: 'Complete transcribed liner notes, tracklist, and credits.',
          },
          confidenceScore: {
            type: Type.NUMBER,
            description: 'Confidence score from 0.0 to 1.0 based on print legibility.',
          },
          catalogNumber: {
            type: Type.STRING,
            description: 'Catalog number if visible, else empty string.',
          },
          recordLabel: {
            type: Type.STRING,
            description: 'Record label name if visible, else empty string.',
          },
          pressingNotes: {
            type: Type.STRING,
            description: 'Recording studio, tape, or pressing notes if visible.',
          },
        },
        required: ['extractedText', 'confidenceScore'],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as LinerNoteOcrResult;
  return {
    extractedText: parsed.extractedText || 'No legible text detected.',
    confidenceScore:
      typeof parsed.confidenceScore === 'number'
        ? Math.max(0, Math.min(1, parsed.confidenceScore))
        : 0.85,
    catalogNumber: parsed.catalogNumber || null,
    recordLabel: parsed.recordLabel || null,
    pressingNotes: parsed.pressingNotes || null,
  };
}

export interface VinylTrackBreak {
  trackNumber: number;
  side: string;
  title: string;
  startSec: number;
  endSec: number;
  confidence: number;
  reasoning: string;
}

export interface VinylBreakDetectionInput {
  mediaType?: 'vinyl' | 'cassette';
  durationSec: number;
  albumTitle?: string;
  artist?: string;
  side?: string;
  rpm?: string;
  tapeType?: string;
  noiseReduction?: string;
  expectedTrackTitles?: string[];
  rmsEnvelope: Array<{ timeSec: number; dbFs: number }>;
  candidateValleys: Array<{ startSec: number; endSec: number; minDbFs: number }>;
  audioBuffer?: Buffer;
  audioMimeType?: string;
}

export interface VinylBreakDetectionResult {
  tracks: VinylTrackBreak[];
  notes: string;
}

export async function detectVinylTrackBreaksWithGemini(
  input: VinylBreakDetectionInput
): Promise<VinylBreakDetectionResult> {
  const ai = getAiClient();
  if (!ai) {
    throw new Error(
      'AI track-break detection is not configured for this workspace yet.'
    );
  }

  const isCassette = input.mediaType === 'cassette';
  const promptText = [
    isCassette
      ? 'You are an archival cassette tape mastering engineer for Remus.'
      : 'You are an archival vinyl mastering engineer for Remus.',
    isCassette
      ? `Analyze this digitized cassette tape transfer (${input.side || 'Side A'}, ${input.tapeType || 'Type I · Normal (120µs)'}, ${input.noiseReduction || 'Dolby NR Off'}, total duration ${input.durationSec.toFixed(2)}s).`
      : `Analyze this digitized vinyl transfer (${input.side || 'Side A'}, ${input.rpm || '33⅓ RPM'}, total duration ${input.durationSec.toFixed(2)}s).`,
    input.albumTitle ? `Release title: "${input.albumTitle}".` : '',
    input.artist ? `Artist: "${input.artist}".` : '',
    input.expectedTrackTitles && input.expectedTrackTitles.length > 0
      ? `Existing track title hints: ${JSON.stringify(input.expectedTrackTitles)}.`
      : '',
    isCassette
      ? 'Identify the exact track breaks (startSec and endSec in seconds) separating songs on this cassette side.'
      : 'Identify the exact track breaks (startSec and endSec in seconds) separating songs on this vinyl side.',
    isCassette
      ? 'Ignore brief leader-tape splices or deck transport clicks at the very beginning (<1.5s), steady tape hiss floor, and short intra-song quiet passages; focus on genuine inter-track silence gaps or musical transitions.'
      : 'Ignore brief lead-in groove clicks/needle-drop pops at the very beginning (<1.5s) and short intra-song quiet passages; focus on genuine inter-track rill/silence valleys or musical transitions.',
    'Ensure tracks are contiguous or cleanly bounded between 0 and total duration, with startSec < endSec, sorted chronologically.',
    `Measured candidate low-energy silence valleys: ${JSON.stringify(input.candidateValleys.slice(0, 60))}`,
    `Sampled RMS energy profile (timeSec -> dbFs): ${JSON.stringify(input.rmsEnvelope.slice(0, 240))}`,
  ]
    .filter(Boolean)
    .join('\n');

  const parts: Array<
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  > = [];

  if (input.audioBuffer && input.audioBuffer.length > 0 && input.audioMimeType) {
    parts.push({
      inlineData: {
        mimeType: input.audioMimeType,
        data: input.audioBuffer.toString('base64'),
      },
    });
  }
  parts.push({ text: promptText });

  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: { parts },
    config: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          tracks: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                trackNumber: { type: Type.INTEGER },
                side: { type: Type.STRING },
                title: { type: Type.STRING },
                startSec: { type: Type.NUMBER },
                endSec: { type: Type.NUMBER },
                confidence: { type: Type.NUMBER },
                reasoning: { type: Type.STRING },
              },
              required: ['trackNumber', 'side', 'title', 'startSec', 'endSec', 'confidence', 'reasoning'],
            },
          },
          notes: {
            type: Type.STRING,
            description: isCassette
              ? 'Short engineering summary of detected leader trim, inter-track gaps, and split points.'
              : 'Short engineering summary of detected lead-in, inter-track rills, and split points.',
          },
        },
        required: ['tracks', 'notes'],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? '{}').trim()) as VinylBreakDetectionResult;
  const maxDur = Math.max(0.5, input.durationSec);
  const rawTracks = Array.isArray(parsed.tracks) ? parsed.tracks : [];
  const normalized = rawTracks
    .map((t, idx) => {
      const start = Math.max(0, Math.min(maxDur - 0.1, Number(t.startSec) || 0));
      const end = Math.max(start + 0.1, Math.min(maxDur, Number(t.endSec) || maxDur));
      return {
        trackNumber: idx + 1,
        side: (t.side || input.side || 'A').trim(),
        title: (t.title || `Track ${idx + 1}`).trim(),
        startSec: Number(start.toFixed(2)),
        endSec: Number(end.toFixed(2)),
        confidence:
          typeof t.confidence === 'number'
            ? Math.max(0, Math.min(1, t.confidence))
            : 0.9,
        reasoning: (t.reasoning || 'Inter-track silence valley detected').trim(),
      };
    })
    .sort((a, b) => a.startSec - b.startSec)
    .map((t, idx) => ({ ...t, trackNumber: idx + 1 }));

  return {
    tracks: normalized,
    notes: parsed.notes || `Identified ${normalized.length} track breaks across ${maxDur.toFixed(1)}s capture.`,
  };
}
