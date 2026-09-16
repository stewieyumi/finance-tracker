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
          { text: "Extract the following details from this receipt: 'merchant' (string), 'amount' (number), 'date' (YYYY-MM-DD), 'category' (string). For category, choose from: 'Food & Dining', 'Transport', 'Utilities', 'Laundry & Home', 'Shopping', 'Other'. Return ONLY a raw JSON object. Do not include markdown formatting like ```json." },
          { inline_data: { mime_type: mimeType, data: base64Data } }
        ]
      }]
    };

    // Using the absolute most stable model string with zero experimental config flags
    const response = await fetch(`[https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=$](https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=$){apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    
    // Manually strip any Markdown formatting if the AI disobeys instructions
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
