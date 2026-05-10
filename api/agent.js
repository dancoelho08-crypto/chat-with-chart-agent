// Agent endpoint
// POST /api/agent with { message, fhir_token, patient_id, history? }
// Runs an agent loop with Claude using FHIR tools, returns final answer.

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

// We need to know which tools exist. We'll fetch them from our registry at startup.
// In a real production system we'd cache this; for now we fetch on each request.
async function getToolDefinitions(baseUrl) {
  const response = await fetch(`${baseUrl}/api/tools`);
  if (!response.ok) {
    throw new Error(`Failed to load tool definitions: ${response.status}`);
  }
  const data = await response.json();
  return data.tools;
}

// Execute a tool by calling our own registry endpoint
async function executeTool(baseUrl, toolName, input, fhirToken) {
  const response = await fetch(`${baseUrl}/api/tools`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tool: toolName,
      input: input,
      fhir_token: fhirToken
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Tool execution failed: ${response.status} ${errorBody}`);
  }

  const data = await response.json();
  return data.result;
}

// Build the system prompt that tells Claude its role and context
function buildSystemPrompt(patientId) {
  return `You are a clinical assistant helping a healthcare provider review a patient's chart.

The active patient has FHIR ID: ${patientId}
You should use this patient_id when calling any tool that requires it.

You have access to tools that fetch real-time data from the patient's electronic health record via FHIR. Use these tools to answer questions about the patient. Do not make up clinical information — always check via tools when needed.

Guidelines:
- Be concise and clinically appropriate in your responses
- When citing specific data (dates, values, medication names), use the exact information returned by tools
- If you don't have enough information to answer fully, say so rather than speculating
- For complex questions, you may need to call multiple tools to gather sufficient context`;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed. Use POST." });
  }

  try {
    const { message, fhir_token, patient_id, history = [] } = req.body;

    // Validate inputs
    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Missing 'message' field" });
    }
    if (!fhir_token || typeof fhir_token !== "string") {
      return res.status(400).json({ error: "Missing 'fhir_token' field" });
    }
    if (!patient_id || typeof patient_id !== "string") {
      return res.status(400).json({ error: "Missing 'patient_id' field" });
    }

    // Figure out the base URL of this deployment (so we can call our own /api/tools)
    const protocol = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers.host;
    const baseUrl = `${protocol}://${host}`;

    // Load tool definitions from our registry
    const toolDefinitions = await getToolDefinitions(baseUrl);

    // Build the messages array (history + new user message)
    const messages = [
      ...history,
      { role: "user", content: message }
    ];

    // Build the system prompt
    const systemPrompt = buildSystemPrompt(patient_id);

    // PHASE 1: Single Claude call, no loop yet
    const claudeResponse = await client.messages.create({
      model: "claude-sonnet-4-5",
      max_tokens: 2048,
      system: systemPrompt,
      tools: toolDefinitions,
      messages: messages
    });

    // For Phase 1, just return Claude's raw response so we can see what comes back
    return res.status(200).json({
      stop_reason: claudeResponse.stop_reason,
      content: claudeResponse.content,
      usage: claudeResponse.usage,
      // Echo back useful debug info
      debug: {
        tool_count: toolDefinitions.length,
        message_count: messages.length
      }
    });

  } catch (error) {
    console.error("Agent error:", error);
    return res.status(500).json({
      error: "Agent failed",
      details: error.message
    });
  }
}
