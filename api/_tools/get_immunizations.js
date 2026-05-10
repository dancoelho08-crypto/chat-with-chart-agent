// Tool: get_immunizations
// Returns a patient's immunization history sorted by most recent first.

import { fhirRequest, unwrapBundle } from "../_fhir/client.js";

export const definition = {
  name: "get_immunizations",
  description: "Get a patient's complete immunization (vaccine) history. Returns each immunization with vaccine name, CVX code, administration date, and status. Sorted most recent first. Use this when the user asks about vaccines, immunizations, vaccination status, or whether a patient is up to date on shots.",
  input_schema: {
    type: "object",
    properties: {
      patient_id: {
        type: "string",
        description: "The FHIR resource ID of the patient."
      }
    },
    required: ["patient_id"]
  }
};

export async function handler({ patient_id }, accessToken) {
  // Fetch all Immunization resources for this patient
  const bundle = await fhirRequest(
    `Immunization?patient=${patient_id}&_sort=-date`,
    accessToken
  );

  // Unwrap the Bundle into a flat array of Immunization resources
  const immunizations = unwrapBundle(bundle);

  // Transform each FHIR Immunization into a clean object for Claude
  const cleaned = immunizations.map(imm => {
    // Find the CVX coding (CVX is the CDC's vaccine code system)
    const cvxCoding = imm.vaccineCode?.coding?.find(
      c => c.system?.includes("cvx")
    );

    return {
      vaccine_name: imm.vaccineCode?.text
        || cvxCoding?.display
        || imm.vaccineCode?.coding?.[0]?.display
        || "Unknown vaccine",
      cvx_code: cvxCoding?.code || null,
      administered_date: imm.occurrenceDateTime || null,
      status: imm.status || "unknown"
    };
  });

  return {
    count: cleaned.length,
    immunizations: cleaned
  };
}
