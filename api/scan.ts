interface VercelApiRequest { method?: string; body?: any; }
interface VercelApiResponse { status: (code: number) => VercelApiResponse; json: (data: any) => void; }

export const config = { api: { bodyParser: { sizeLimit: '4mb' } } };

export default async function handler(req: VercelApiRequest, res: VercelApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { image } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY is missing' });

    // Safely extract mime type and base64 string regardless of image type
    const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
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
          { text: "Extract the following details from this receipt: 'merchant' (string), 'amount' (number), 'date' (YYYY-MM-DD), 'category' (string). For category, strictly choose one of: 'Food & Dining', 'Transport', 'Utilities', 'Laundry & Home', 'Shopping', 'Other'." },
          { inline_data: { mime_type: mimeType, data: base64Data } }
        ]
      }],
      // FORCE GEMINI TO RETURN PURE JSON, NO MARKDOWN
      generationConfig: { responseMimeType: "application/json" }
    };

    const response = await fetch(`[https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=$](https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=$){apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error.message);

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    const result = JSON.parse(text);

    return res.status(200).json(result);
  } catch (error: any) {
    console.error("AI Scan Error:", error.message || error);
    return res.status(500).json({ error: "Failed to process receipt" });
  }
}
