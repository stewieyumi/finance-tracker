interface VercelApiRequest { method?: string; headers: Record<string, string | string[] | undefined>; body?: any; }
interface VercelApiResponse { status: (code: number) => VercelApiResponse; json: (data: any) => void; }

declare const process: { env: { GEMINI_API_KEY?: string; APP_AUTH_SECRET?: string; VITE_GOOGLE_CLIENT_ID?: string; [key: string]: string | undefined } };

export const config = { api: { bodyParser: { sizeLimit: '4mb' } } };

function getClientToken(req: VercelApiRequest): string | undefined {
  const syncPasscode = req.headers["x-sync-passcode"];
  if (typeof syncPasscode === "string") return syncPasscode;

  const appAuth = req.headers["x-app-auth"];
  if (typeof appAuth === "string") return appAuth;

  const authorization = req.headers.authorization;
  if (typeof authorization === "string") return authorization.replace(/^Bearer\s+/i, "");

  return undefined;
}

export default async function handler(req: VercelApiRequest, res: VercelApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const APP_AUTH_SECRET = process.env.APP_AUTH_SECRET;
  if (!APP_AUTH_SECRET) {
    return res.status(500).json({ error: 'Server configuration error: Missing APP_AUTH_SECRET.' });
  }

  const clientToken = getClientToken(req);
  if (!clientToken) {
    return res.status(401).json({ error: 'Unauthorized: Missing token.' });
  }

  let isAuthenticated = false;
  if (clientToken === APP_AUTH_SECRET) {
    isAuthenticated = true;
  } else if (clientToken.startsWith("eyJ") && clientToken.split(".").length === 3) {
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
    return res.status(401).json({ error: 'Unauthorized: Invalid passcode or Google token.' });
  }

  try {
    const { image } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY is missing' });

    const matches = image.match(/^data:(.+?);base64,(.+)$/);
    let mimeType = "image/jpeg";
    let base64Data = image;
    
    if (matches && matches.length === 3) {
      mimeType = matches[1];
      base64Data = matches[2];
    } else if (image.includes(',')) {
      base64Data = image.split(',')[1];
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

    const endpoint = "https://generativelanguage.googleapis.com/v1/models/gemini-3.5-flash:generateContent";

    const response = await fetch(endpoint, {
      method: "POST",
      headers: { 
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey
      },
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
    console.error("AI Scan Error:", error.message || error);
    return res.status(500).json({ error: "Failed to process receipt: " + (error.message || "") });
  }
}
