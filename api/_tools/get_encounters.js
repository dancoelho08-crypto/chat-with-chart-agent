// Tool: get_encounters
// Returns a patient's encounter (visit) history.

import { fhirRequest, unwrapBundle } from "../_fhir/client.js";

export const definition = {
  name: "get_encounters",
  description: "Get a patient's encounter (visit) history. Returns each encounter with date, class (ambulatory/inpatient/emergency), type or reason, and status. Sorted most recent first. Use this for questions about visits, hospitalizations, ED visits, or recent care history.",
  input_schema: {
    type: "object",
    properties: {
      patient_id: {
        type: "string",
        description: "The FHIR resource ID of the patient."
      },
      limit: {
        type: "integer",
        description: "Maximum number of encounters to return. Defaults to 20.",
        default: 20
      }
    },
    required: ["patient_id"]
  }
};

export async function handler({ patient_id, limit = 20 }, accessToken) {
  const bundle = await fhirRequest(
    `Encounter?patient=${patient_id}&_sort=-date&_count=${limit}`,
    accessToken
  );

  const encounters = unwrapBundle(bundle);

  const cleaned = encounters.map(e => {
    return {
      date: e.period?.start || null,
      end_date: e.period?.end || null,
      class: e.class?.code || e.class?.display || null,
      type: e.type?.[0]?.text
        || e.type?.[0]?.coding?.[0]?.display
        || null,
      reason: e.reasonCode?.[0]?.text
        || e.reasonCode?.[0]?.coding?.[0]?.display
        || null,
      status: e.status || "unknown",
      service_provider: e.serviceProvider?.display || null
    };
  });

  return {
    count: cleaned.length,
    encounters: cleaned
  };
}
