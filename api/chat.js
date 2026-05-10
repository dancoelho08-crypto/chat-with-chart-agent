import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

export default async function handler(req, res) {
  // Allow only POST requests
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    const { message } = req.body;

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Missing 'message' in request body" });
    }

    const response = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 1024,
      messages: [
        { role: "user", content: message }
      ]
    });

    const textResponse = response.content
      .filter(block => block.type === "text")
      .map(block => block.text)
      .join("\n");

    res.status(200).json({
      response: textResponse,
      usage: response.usage
    });
  } catch (error) {
    console.error("Claude API error:", error);
    res.status(500).json({
      error: "Failed to call Claude",
      details: error.message
    });
  }
}
