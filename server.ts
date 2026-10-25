import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';
import dotenv from 'dotenv';
import { extractDeterministicBolFallback } from './src/bolParser';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Token-bucket rate limiter per IP (DEC-12 / Section 3.B)
const rateBuckets = new Map<string, { tokens: number; lastRefill: number }>();
function checkRateLimit(ip: string, maxPerMin: number): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(ip) || { tokens: maxPerMin, lastRefill: now };
  const elapsedMinutes = (now - bucket.lastRefill) / 60000;
  bucket.tokens = Math.min(maxPerMin, bucket.tokens + elapsedMinutes * maxPerMin);
  bucket.lastRefill = now;
  if (bucket.tokens < 1) {
    rateBuckets.set(ip, bucket);
    return false;
  }
  bucket.tokens -= 1;
  rateBuckets.set(ip, bucket);
  return true;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // 1. Request ID & Security Headers Middleware (Section 3.B)
  app.use((req, res, next) => {
    const reqId = `bol_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    res.setHeader('X-Request-Id', reqId);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });

  // 2. Payload size guard (up to 15MB for base64 BOL/Rate-Con image uploads)
  app.use(express.json({ limit: '15mb' }));

  // 3. Zero-PII BOL & Rate-Con OCR Extraction Endpoint (/api/bol/analyze)
  app.post('/api/bol/analyze', async (req, res) => {
    const reqId = String(res.getHeader('X-Request-Id') || 'req_unknown');
    const clientIp = req.ip || req.socket.remoteAddress || 'unknown';

    // Rate limit: 10 uploads / min / IP
    if (!checkRateLimit(`ocr_${clientIp}`, 10)) {
      res.status(429).json({
        code: 'RATE_LIMITED',
        message: 'OCR upload limit reached (10 scans/minute). Please wait a moment.',
        requestId: reqId,
      });
      return;
    }

    const { rawText, imageBase64, mimeType, company_dot_number } = req.body || {};

    // Honeypot trap check
    if (company_dot_number && String(company_dot_number).trim().length > 0) {
      res.status(200).json({ status: 'dropped', requestId: reqId });
      return;
    }

    if (!rawText && !imageBase64) {
      res.status(400).json({
        code: 'INVALID_INPUT',
        message: 'Provide either BOL/Rate-Con text or an uploaded document image.',
        requestId: reqId,
      });
      return;
    }

    try {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        // Deterministic Fallback: operates standalone without external API key
        const extraction = extractDeterministicBolFallback(String(rawText || ''));
        res.json({
          status: 'ok',
          engine: 'deterministic_heuristic_fallback',
          requestId: reqId,
          extraction,
        });
        return;
      }

      const ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build',
          },
        },
      });

      const parts: Array<{ text?: string; inlineData?: { data: string; mimeType: string } }> = [];
      if (imageBase64 && mimeType) {
        parts.push({
          inlineData: {
            data: String(imageBase64),
            mimeType: String(mimeType),
          },
        });
      }

      parts.push({
        text: `You are the BillOff-Lading Zero-PII BOL & Rate Confirmation Extraction Engine (DEC-10).
Analyze the provided freight document (Rate Confirmation and/or signed Bill of Lading + ELD timestamps).
1. Extract the Load Number, Rate Confirmation ID, Broker Name, Broker MC# (digits only), Receiver Facility & City/State, Arrival Time (HH:MM), Departure Time (HH:MM), Notice Sent Time (HH:MM), Total Dwell Minutes, Free Time Minutes (default 120 if unspecified), Detention Rate in Dollars/hr (default 60 if unspecified), and Notice Window Hours (default 24 if unspecified).
2. ZERO-PII SCRUBBING (DEC-10): Identify any private carrier identity fields (Carrier Legal Name, Carrier MC/DOT, Driver Name/Signature, Linehaul Gross Rate) and list them as redacted tokens in redactedPiiFields so the carrier's private customer/rate data never enters the shared Broker Fit Index.
Document input:
${rawText || 'See attached BOL / Rate Confirmation image.'}`,
      });

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              loadNumber: { type: Type.STRING },
              rateConId: { type: Type.STRING },
              brokerName: { type: Type.STRING },
              brokerMc: { type: Type.STRING },
              facilityLocation: { type: Type.STRING },
              deliveryDate: { type: Type.STRING },
              arrivalTime: { type: Type.STRING },
              departureTime: { type: Type.STRING },
              noticeSentTime: { type: Type.STRING },
              totalDwellMins: { type: Type.INTEGER },
              freeTimeMins: { type: Type.INTEGER },
              detentionRateDollars: { type: Type.NUMBER },
              noticeWindowHrs: { type: Type.INTEGER },
              redactedPiiFields: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              clauseSummary: { type: Type.STRING },
            },
            required: [
              'loadNumber',
              'rateConId',
              'brokerName',
              'brokerMc',
              'facilityLocation',
              'deliveryDate',
              'arrivalTime',
              'departureTime',
              'noticeSentTime',
              'totalDwellMins',
              'freeTimeMins',
              'detentionRateDollars',
              'noticeWindowHrs',
              'redactedPiiFields',
              'clauseSummary',
            ],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      res.json({
        status: 'ok',
        requestId: reqId,
        extraction: parsed,
      });
    } catch (error) {
      res.status(500).json({
        code: 'EXTRACTION_FAILED',
        message: error instanceof Error ? error.message : 'Failed to parse freight document.',
        requestId: reqId,
      });
    }
  });

  // Vite middleware for development or static serving in production
  if (process.env.NODE_ENV !== 'production') {
    // Pin Vite to this project folder so it never scans or watches whatever
    // folder the terminal happened to be in (e.g. the whole home directory).
    const vite = await createViteServer({
      root: __dirname,
      configFile: path.resolve(__dirname, 'vite.config.ts'),
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`BillOff-Lading server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
