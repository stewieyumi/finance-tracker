interface VercelApiRequest { method?: string; body?: any; }
interface VercelApiResponse { status: (code: number) => VercelApiResponse; json: (data: any) => void; }

export const config = { api: { bodyParser: { sizeLimit: '4mb' } } };

export default async function handler(req: VercelApiRequest, res: VercelApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
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
          { text: "Extract the following details from this receipt: 'merchant' (string), 'amount' (number), 'date' (YYYY-MM-DD), 'category' (string). For category, strictly choose from: 'Food & Dining', 'Transport', 'Utilities', 'Laundry & Home', 'Shopping', 'Other'." },
          { inline_data: { mime_type: mimeType, data: base64Data } }
        ]
      }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            merchant: { type: "STRING" },
            amount: { type: "NUMBER" },
            date: { type: "STRING" },
            category: { type: "STRING" }
          },
          required: ["merchant", "amount", "date", "category"]
        }
      }
    };

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    
    try {
      const result = JSON.parse(text);
      return res.status(200).json({ success: true, parsed: result, raw_text: text, api_data: data });
    } catch (parseErr: any) {
      return res.status(200).json({ success: false, error: "JSON Parse failed", raw_text: text, api_data: data });
    }
  } catch (error: any) {
    console.error("AI Scan Error:", error.message || error);
    return res.status(500).json({ error: "Failed to process receipt: " + (error.message || "") });
  }
}
