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
      'GEMINI_API_KEY is not configured. Add a Gemini API key in Settings > Secrets to run AI liner-note OCR.'
    );
  }

  // Resolve local filesystem path cleanly
  const cleanRel = imagePathOrRelativeUrl.replace(/^\/+/, '');
  const resolvedPath = path.join(process.cwd(), cleanRel);

  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Liner note image not found on disk: ${cleanRel}`);
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
    model: 'gemini-3.8-flash',
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
