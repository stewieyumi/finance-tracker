interface VercelApiRequest { method?: string; headers: Record<string, string | string[] | undefined>; body?: any; }
interface VercelApiResponse { status: (code: number) => VercelApiResponse; json: (data: any) => void; }

declare const process: { env: { GEMINI_API_KEY?: string; VITE_GOOGLE_CLIENT_ID?: string; [key: string]: string | undefined } };

export const config = { api: { bodyParser: { sizeLimit: '4mb' } } };

function getClientToken(req: VercelApiRequest): string | undefined {
  const authorization = req.headers.authorization;
  if (typeof authorization === "string") return authorization.replace(/^Bearer\s+/i, "");
  return undefined;
}

export default async function handler(req: VercelApiRequest, res: VercelApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const clientToken = getClientToken(req);
  if (!clientToken) {
    return res.status(401).json({ error: 'Unauthorized: Missing token.' });
  }

  let isAuthenticated = false;
  if (clientToken.startsWith("eyJ") && clientToken.split(".").length === 3) {
    try {
      const googleRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${clientToken}`);
      if (googleRes.ok) {
        const tokenInfo = await googleRes.json();
        if (tokenInfo.sub && tokenInfo.aud === process.env.VITE_GOOGLE_CLIENT_ID) {
          isAuthenticated = true;
        }
      }
    } catch (err) {
      console.error("Google verification error:", err);
    }
  }

  if (!isAuthenticated) {
    return res.status(401).json({ error: 'Unauthorized: Invalid Google token.' });
  }

  try {
    const { image } = req.body;
    if (!image || typeof image !== 'string') {
      return res.status(400).json({ error: 'Bad Request: Missing or invalid image payload.' });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Server Error: GEMINI_API_KEY is missing.' });

    const matches = image.match(/^data:(.+?);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      return res.status(400).json({ error: 'Bad Request: Image must be a valid base64 data URI.' });
    }

    const mimeType = matches[1];
    const base64Data = matches[2];
    const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
    
    if (!allowedMimeTypes.includes(mimeType)) {
      return res.status(415).json({ error: `Unsupported Media Type: ${mimeType} is not allowed.` });
    }

    if (base64Data.length * 0.75 > 4 * 1024 * 1024) {
      return res.status(413).json({ error: 'Payload Too Large: Image exceeds the 4MB limit.' });
    }

    const payload = {
      contents: [{
        parts: [
          { text: "Extract the details from this receipt." },
          { inlineData: { mimeType: mimeType, data: base64Data } }
        ]
      }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            merchant: { type: "STRING" },
            amount: { type: "NUMBER" },
            date: { type: "STRING", description: "YYYY-MM-DD" },
            category: {
              type: "STRING",
              enum: ["Food & Dining", "Transport", "Utilities", "Laundry & Home", "Shopping", "Other"]
            }
          },
          required: ["merchant", "amount", "date", "category"]
        }
      }
    };

    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const cleanText = text.replace(/```json/gi, "").replace(/```/g, "").trim();
    
    try {
      const result = JSON.parse(cleanText);
      return res.status(200).json({ success: true, parsed: result, raw_text: cleanText });
    } catch (parseErr: any) {
      return res.status(200).json({ success: false, error: "JSON Parse failed", raw_text: cleanText, api_data: data });
    }
  } catch (error: any) {
    return res.status(500).json({ error: "Failed to process receipt: " + (error.message || "") });
  }
}
