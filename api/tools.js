// Tool registry endpoint
// GET  /api/tools        → list all available tools
// POST /api/tools        → execute a specific tool

// Import each tool's definition and handler
import * as patientDemographics from "./_tools/get_patient_demographics.js";
import * as immunizations from "./_tools/get_immunizations.js";
import * as conditions from "./_tools/get_conditions.js";
import * as medications from "./_tools/get_medications.js";
import * as allergies from "./_tools/get_allergies.js";
import * as observations from "./_tools/get_observations.js";
import * as encounters from "./_tools/get_encounters.js";

// Build the registry — a map from tool name to its handler
const tools = {
  [patientDemographics.definition.name]: patientDemographics,
  [immunizations.definition.name]: immunizations,
  [conditions.definition.name]: conditions,
  [medications.definition.name]: medications,
  [allergies.definition.name]: allergies,
  [observations.definition.name]: observations,
  [encounters.definition.name]: encounters
};

export default async function handler(req, res) {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // GET — list all available tools
  if (req.method === "GET") {
    const definitions = Object.values(tools).map(t => t.definition);
    return res.status(200).json({
      tools: definitions,
      count: definitions.length
    });
  }

  // POST — execute a tool
  if (req.method === "POST") {
    try {
      const { tool, input, fhir_token } = req.body;

      // Validate inputs
      if (!tool || typeof tool !== "string") {
        return res.status(400).json({
          error: "Missing or invalid 'tool' field in request body"
        });
      }

      if (!input || typeof input !== "object") {
        return res.status(400).json({
          error: "Missing or invalid 'input' field in request body"
        });
      }

      if (!fhir_token || typeof fhir_token !== "string") {
        return res.status(400).json({
          error: "Missing 'fhir_token' field in request body"
        });
      }

      // Look up the tool
      const toolModule = tools[tool];
      if (!toolModule) {
        return res.status(404).json({
          error: `Unknown tool: '${tool}'`,
          available_tools: Object.keys(tools)
        });
      }

      // Execute the handler
      const result = await toolModule.handler(input, fhir_token);

      return res.status(200).json({
        tool: tool,
        result: result
      });

    } catch (error) {
      console.error("Tool execution error:", error);
      return res.status(500).json({
        error: "Tool execution failed",
        details: error.message
      });
    }
  }

  // Method not allowed
  return res.status(405).json({
    error: "Method not allowed. Use GET to list tools or POST to execute a tool."
  });
}
