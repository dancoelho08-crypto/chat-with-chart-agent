// Tool: get_patient_demographics
// Returns name, sex, DOB, age, and MRN for a patient.

import { fhirRequest } from "../_fhir/client.js";

export const definition = {
  name: "get_patient_demographics",
  description: "Get demographic information for a specific patient by FHIR ID. Returns name, sex, date of birth, age in years, and medical record number (MRN). Use this when the user asks about who the patient is, their basic identity, age, or contact info.",
  input_schema: {
    type: "object",
    properties: {
      patient_id: {
        type: "string",
        description: "The FHIR resource ID of the patient (e.g., '2cda5aad-e409-4070-9a15-e1c35c46ed5a')."
      }
    },
    required: ["patient_id"]
  }
};

export async function handler({ patient_id }, accessToken) {
  // Fetch the Patient resource directly
  const patient = await fhirRequest(`Patient/${patient_id}`, accessToken);

  // Extract human-readable name
  const givenName = patient.name?.[0]?.given?.join(" ") || "";
  const familyName = patient.name?.[0]?.family || "";
  const fullName = [givenName, familyName].filter(Boolean).join(" ") || "Unknown";

  // Calculate age from DOB
  const dob = patient.birthDate;
  let age = null;
  if (dob) {
    age = Math.floor(
      (Date.now() - new Date(dob)) / (1000 * 60 * 60 * 24 * 365.25)
    );
  }

  // Find MRN — try to locate the medical record number specifically
  const mrnIdentifier = patient.identifier?.find(
    i => i.type?.text === "MRN" || i.type?.coding?.some(c => c.code === "MR")
  );
  const mrn = mrnIdentifier?.value || patient.identifier?.[0]?.value || patient.id;

  // Return clean, cleaned-up object for Claude
  return {
    patient_id: patient.id,
    name: fullName,
    sex: patient.gender || "unknown",
    date_of_birth: dob || "unknown",
    age_years: age,
    mrn: mrn
  };
}
