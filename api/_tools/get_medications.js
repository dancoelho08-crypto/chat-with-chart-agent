// Tool: get_medications
// Returns a patient's medication orders.

import { fhirRequest, unwrapBundle } from "../_fhir/client.js";

export const definition = {
  name: "get_medications",
  description: "Get a patient's medication orders (prescriptions). Returns each medication with name, dosage instructions, status (active/stopped/completed), and authored date. Sorted with active medications first, then most recent. Optionally filter by status. Use this for any question about prescriptions, current medications, or medication history.",
  input_schema: {
    type: "object",
    properties: {
      patient_id: {
        type: "string",
        description: "The FHIR resource ID of the patient."
      },
      status: {
        type: "string",
        enum: ["active", "on-hold", "completed", "stopped", "cancelled"],
        description: "Optional: filter to only medications with this status."
      }
    },
    required: ["patient_id"]
  }
};

export async function handler({ patient_id, status }, accessToken) {
  let path = `MedicationRequest?patient=${patient_id}`;
  if (status) {
    path += `&status=${status}`;
  }

  const bundle = await fhirRequest(path, accessToken);
  const medications = unwrapBundle(bundle);

  const cleaned = medications.map(m => {
    const rxnormCoding = m.medicationCodeableConcept?.coding?.find(c =>
      c.system?.includes("rxnorm")
    );

    return {
      name: m.medicationCodeableConcept?.text
        || m.medicationCodeableConcept?.coding?.[0]?.display
        || "Unknown medication",
      rxnorm_code: rxnormCoding?.code || null,
      status: m.status || "unknown",
      dosage_instruction: m.dosageInstruction?.[0]?.text || null,
      authored_date: m.authoredOn || null,
      intent: m.intent || null
    };
  });

  // Sort: active first, then most recently authored
  cleaned.sort((a, b) => {
    const aActive = a.status === "active" ? 0 : 1;
    const bActive = b.status === "active" ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    return new Date(b.authored_date || 0) - new Date(a.authored_date || 0);
  });

  return {
    count: cleaned.length,
    active_count: cleaned.filter(m => m.status === "active").length,
    medications: cleaned
  };
}
