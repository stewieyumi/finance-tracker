interface VercelApiRequest {
  method?: string;
  body?: any;
}

interface VercelApiResponse {
  status: (code: number) => VercelApiResponse;
  json: (data: any) => void;
}

export const config = {
  api: {
    bodyParser: { sizeLimit: '4mb' }
  }
};

export default async function handler(req: VercelApiRequest, res: VercelApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { image } = req.body;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'GEMINI_API_KEY is missing' });
    }

    // Strip the data:image/...;base64, prefix
    const base64Data = image.includes(',') ? image.split(',')[1] : image;

    const payload = {
      contents: [{
        parts: [
          { text: "Extract the following details from this receipt and return ONLY a raw JSON object with no markdown formatting. Keys: 'merchant' (string), 'amount' (number), 'date' (YYYY-MM-DD), 'category' (string). For category, strictly choose one of: 'Food & Dining', 'Transport', 'Utilities', 'Laundry & Home', 'Shopping', 'Other'." },
          { inline_data: { mime_type: "image/jpeg", data: base64Data } }
        ]
      }]
    };

    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    
    if (data.error) throw new Error(data.error.message);

    const text = data.candidates[0].content.parts[0].text;
    const cleanJson = text.replace(/```json/g, "").replace(/```/g, "").trim();
    const result = JSON.parse(cleanJson);

    return res.status(200).json(result);
  } catch (error) {
    console.error("AI Scan Error:", error);
    return res.status(500).json({ error: "Failed to process receipt" });
  }
}
