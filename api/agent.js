// Agent endpoint with full agent loop
// POST /api/agent with { message, fhir_token, patient_id, history? }
// Runs an iterative agent loop: calls Claude, executes any tools, repeats until done.

import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
});

const MAX_ITERATIONS = 10;
const MODEL = "claude-sonnet-4-5";
const MAX_TOKENS = 2048;

// Fetch the list of available tool definitions from our registry
async function getToolDefinitions(baseUrl) {
  const response = await fetch(`${baseUrl}/api/tools`);
  if (!response.ok) {
    throw new Error(`Failed to load tool definitions: ${response.status}`);
  }
  const data = await response.json();
  return data.tools;
}

// Execute a tool by calling our registry endpoint
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
    throw new Error(`Tool '${toolName}' failed: ${response.status} ${errorBody}`);
  }

  const data = await response.json();
  return data.result;
}

function buildSystemPrompt(patientId) {
  return `You are a clinical assistant helping a healthcare provider review a patient's chart.

The active patient has FHIR ID: ${patientId}
You should use this patient_id when calling any tool that requires it.

You have access to tools that fetch real-time data from the patient's electronic health record via FHIR. Use these tools to answer questions about the patient. Do not make up clinical information — always check via tools when needed.

Guidelines:
- Be concise and clinically appropriate in your responses
- When citing specific data (dates, values, medication names), use the exact information returned by tools
- If you don't have enough information to answer fully, say so rather than speculating
- For complex questions, you may need to call multiple tools to gather sufficient context
- Once you have enough information to answer, provide your answer directly rather than continuing to call tools`;
}

// Run the full agent loop
async function runAgentLoop({ baseUrl, systemPrompt, toolDefinitions, messages, fhirToken }) {
  // Track every iteration for debugging
  const trace = [];
  let conversationMessages = [...messages];

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {

    // Call Claude with current conversation state
    const claudeResponse = await client.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: systemPrompt,
      tools: toolDefinitions,
      messages: conversationMessages
    });

    trace.push({
      iteration: iteration,
      stop_reason: claudeResponse.stop_reason,
      content_types: claudeResponse.content.map(c => c.type),
      usage: claudeResponse.usage
    });

    // CASE 1 — Claude is done, return the final answer
    if (claudeResponse.stop_reason === "end_turn") {
      const finalText = claudeResponse.content
        .filter(b => b.type === "text")
        .map(b => b.text)
        .join("\n");

      return {
        answer: finalText,
        trace: trace,
        iterations_used: iteration + 1,
        final_messages: conversationMessages
      };
    }

    // CASE 2 — Claude wants to use tools
    if (claudeResponse.stop_reason === "tool_use") {
      // Add Claude's response (with tool_use blocks) to the conversation
      conversationMessages.push({
        role: "assistant",
        content: claudeResponse.content
      });

      // Execute each tool call and collect results
      const toolResultBlocks = [];
      const toolUseBlocks = claudeResponse.content.filter(b => b.type === "tool_use");

      for (const toolUse of toolUseBlocks) {
        try {
          const result = await executeTool(
            baseUrl,
            toolUse.name,
            toolUse.input,
            fhirToken
          );

          toolResultBlocks.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: JSON.stringify(result)
          });
        } catch (error) {
          // Tool failed — return the error to Claude so it can react
          toolResultBlocks.push({
            type: "tool_result",
            tool_use_id: toolUse.id,
            content: `Error executing tool: ${error.message}`,
            is_error: true
          });
        }
      }

      // Add the tool results as a user message and loop again
      conversationMessages.push({
        role: "user",
        content: toolResultBlocks
      });

      continue;
    }

    // CASE 3 — Unexpected stop reason
    return {
      answer: `[Agent stopped unexpectedly: ${claudeResponse.stop_reason}]`,
      trace: trace,
      iterations_used: iteration + 1,
      error: `Unexpected stop_reason: ${claudeResponse.stop_reason}`
    };
  }

  // CASE 4 — Hit the iteration cap without finishing
  return {
    answer: "[The agent reached its maximum number of iterations without producing a final answer. The question may require more research or a more focused query.]",
    trace: trace,
    iterations_used: MAX_ITERATIONS,
    error: "Max iterations reached"
  };
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

    if (!message || typeof message !== "string") {
      return res.status(400).json({ error: "Missing 'message' field" });
    }
    if (!fhir_token || typeof fhir_token !== "string") {
      return res.status(400).json({ error: "Missing 'fhir_token' field" });
    }
    if (!patient_id || typeof patient_id !== "string") {
      return res.status(400).json({ error: "Missing 'patient_id' field" });
    }

    const protocol = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers.host;
    const baseUrl = `${protocol}://${host}`;

    const toolDefinitions = await getToolDefinitions(baseUrl);

    const messages = [
      ...history,
      { role: "user", content: message }
    ];

    const systemPrompt = buildSystemPrompt(patient_id);

    const result = await runAgentLoop({
      baseUrl: baseUrl,
      systemPrompt: systemPrompt,
      toolDefinitions: toolDefinitions,
      messages: messages,
      fhirToken: fhir_token
    });

    return res.status(200).json({
      answer: result.answer,
      iterations_used: result.iterations_used,
      trace: result.trace,
      error: result.error || null
    });

  } catch (error) {
    console.error("Agent error:", error);
    return res.status(500).json({
      error: "Agent failed",
      details: error.message
    });
  }
}
