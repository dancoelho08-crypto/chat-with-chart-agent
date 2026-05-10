// Tool: get_observations
// Returns observations (vitals, labs, etc.) for a patient with flexible filtering.

import { fhirRequest, unwrapBundle } from "../_fhir/client.js";

export const definition = {
  name: "get_observations",
  description: "Get observations (clinical measurements) for a patient. Observations include vital signs (blood pressure, heart rate, weight, height, BMI, temperature, oxygen saturation), laboratory results (any blood test or lab), social history (smoking status), and survey results. Filter by category to narrow scope. Returns the most recent observations first. Use this for any question about vitals, labs, lab results, blood tests, blood pressure, weight, BMI, or other clinical measurements.",
  input_schema: {
    type: "object",
    properties: {
      patient_id: {
        type: "string",
        description: "The FHIR resource ID of the patient."
      },
      category: {
        type: "string",
        enum: ["vital-signs", "laboratory", "social-history", "survey", "exam", "therapy", "activity"],
        description: "Filter by observation category. 'vital-signs' = BP, HR, temp, weight, height, BMI, O2 sat. 'laboratory' = lab tests."
      },
      code: {
        type: "string",
        description: "Optional LOINC code to filter to a specific observation type (e.g., '85354-9' for blood pressure, '2093-3' for total cholesterol, '8867-4' for heart rate)."
      },
      limit: {
        type: "integer",
        description: "Maximum number of observations to return. Defaults to 50 for vital-signs or laboratory queries; useful to limit when scanning broad categories.",
        default: 50
      }
    },
    required: ["patient_id"]
  }
};

export async function handler({ patient_id, category, code, limit = 50 }, accessToken) {
  let path = `Observation?patient=${patient_id}&_sort=-date&_count=${limit}`;
  if (category) {
    path += `&category=${category}`;
  }
  if (code) {
    path += `&code=${code}`;
  }

  const bundle = await fhirRequest(path, accessToken);
  const observations = unwrapBundle(bundle);

  const cleaned = observations.map(o => {
    const loincCoding = o.code?.coding?.find(c => c.system?.includes("loinc"));

    // Extract value — observations can store values in several ways
    let value = null;
    let unit = null;
    if (o.valueQuantity) {
      value = o.valueQuantity.value;
      unit = o.valueQuantity.unit || o.valueQuantity.code || null;
    } else if (o.valueString) {
      value = o.valueString;
    } else if (o.valueCodeableConcept) {
      value = o.valueCodeableConcept.text
        || o.valueCodeableConcept.coding?.[0]?.display
        || null;
    } else if (o.component && o.component.length > 0) {
      // Handle compound observations like blood pressure (systolic + diastolic)
      value = o.component.map(comp => {
        const compName = comp.code?.text || comp.code?.coding?.[0]?.display || "?";
        const compVal = comp.valueQuantity?.value;
        const compUnit = comp.valueQuantity?.unit || "";
        return `${compName}: ${compVal} ${compUnit}`.trim();
      }).join(", ");
    }

    // Extract reference range if present
    let reference_range = null;
    const ref = o.referenceRange?.[0];
    if (ref) {
      const low = ref.low?.value;
      const high = ref.high?.value;
      if (low !== undefined && high !== undefined) reference_range = `${low}-${high}`;
      else if (high !== undefined) reference_range = `< ${high}`;
      else if (low !== undefined) reference_range = `> ${low}`;
      else if (ref.text) reference_range = ref.text;
    }

    return {
      name: o.code?.text || o.code?.coding?.[0]?.display || "Unknown observation",
      loinc_code: loincCoding?.code || null,
      value: value,
      unit: unit,
      reference_range: reference_range,
      effective_date: o.effectiveDateTime || o.effectivePeriod?.start || null,
      category: o.category?.[0]?.coding?.[0]?.code || null
    };
  });

  return {
    count: cleaned.length,
    observations: cleaned
  };
}
