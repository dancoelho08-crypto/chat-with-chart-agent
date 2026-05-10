// Tool: get_conditions
// Returns a patient's problem list / diagnoses.

import { fhirRequest, unwrapBundle } from "../_fhir/client.js";

export const definition = {
  name: "get_conditions",
  description: "Get a patient's conditions (problems, diagnoses). Returns each condition with its name, ICD-10 or SNOMED code, clinical status (active/inactive/resolved), onset date, and recorded date. Sorted with active conditions first, then by most recently recorded. Optionally filter by status. Use this for any question about diagnoses, the problem list, medical history, or what conditions a patient has.",
  input_schema: {
    type: "object",
    properties: {
      patient_id: {
        type: "string",
        description: "The FHIR resource ID of the patient."
      },
      status: {
        type: "string",
        enum: ["active", "inactive", "resolved"],
        description: "Optional: filter to only conditions with this clinical status."
      }
    },
    required: ["patient_id"]
  }
};

export async function handler({ patient_id, status }, accessToken) {
  // Build the FHIR query — optionally filter by clinical status
  let path = `Condition?patient=${patient_id}`;
  if (status) {
    path += `&clinical-status=${status}`;
  }

  const bundle = await fhirRequest(path, accessToken);
  const conditions = unwrapBundle(bundle);

  // Transform each Condition
  const cleaned = conditions.map(c => {
    // Find ICD-10 or SNOMED coding
    const icd10Coding = c.code?.coding?.find(coding =>
      coding.system?.includes("icd-10")
    );
    const snomedCoding = c.code?.coding?.find(coding =>
      coding.system?.includes("snomed")
    );

    return {
      name: c.code?.text || c.code?.coding?.[0]?.display || "Unknown condition",
      icd10_code: icd10Coding?.code || null,
      snomed_code: snomedCoding?.code || null,
      clinical_status: c.clinicalStatus?.coding?.[0]?.code || "unknown",
      verification_status: c.verificationStatus?.coding?.[0]?.code || null,
      onset_date: c.onsetDateTime || c.onsetPeriod?.start || null,
      recorded_date: c.recordedDate || null
    };
  });

  // Sort: active first, then most recently recorded
  cleaned.sort((a, b) => {
    const aActive = a.clinical_status === "active" ? 0 : 1;
    const bActive = b.clinical_status === "active" ? 0 : 1;
    if (aActive !== bActive) return aActive - bActive;
    return new Date(b.recorded_date || 0) - new Date(a.recorded_date || 0);
  });

  return {
    count: cleaned.length,
    active_count: cleaned.filter(c => c.clinical_status === "active").length,
    conditions: cleaned
  };
}
