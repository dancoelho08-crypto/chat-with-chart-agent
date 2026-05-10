// Tool: get_allergies
// Returns a patient's allergies and intolerances.

import { fhirRequest, unwrapBundle } from "../_fhir/client.js";

export const definition = {
  name: "get_allergies",
  description: "Get a patient's allergies and intolerances. Returns each with allergen name, criticality (high/low), reactions and their severity, verification status, and recorded date. Sorted with high-criticality first. Use this for any question about allergies, drug allergies, food allergies, or allergic reactions. Critical for medication safety questions.",
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
  const bundle = await fhirRequest(
    `AllergyIntolerance?patient=${patient_id}`,
    accessToken
  );

  const allergies = unwrapBundle(bundle);

  const cleaned = allergies.map(a => {
    // Extract reactions with their manifestations and severity
    const reactions = (a.reaction || []).map(r => ({
      manifestations: (r.manifestation || []).map(m =>
        m.text || m.coding?.[0]?.display
      ).filter(Boolean),
      severity: r.severity || null
    }));

    return {
      allergen: a.code?.text || a.code?.coding?.[0]?.display || "Unknown allergen",
      criticality: a.criticality || "unknown",
      verification_status: a.verificationStatus?.coding?.[0]?.code || null,
      clinical_status: a.clinicalStatus?.coding?.[0]?.code || null,
      type: a.type || null,
      category: a.category || [],
      reactions: reactions,
      recorded_date: a.recordedDate || null
    };
  });

  // Sort: high criticality first, then low, then unknown
  const criticalityOrder = { high: 0, low: 1, "unable-to-assess": 2 };
  cleaned.sort((a, b) => {
    return (criticalityOrder[a.criticality] ?? 3) - (criticalityOrder[b.criticality] ?? 3);
  });

  return {
    count: cleaned.length,
    high_criticality_count: cleaned.filter(a => a.criticality === "high").length,
    allergies: cleaned
  };
}
