// Shared FHIR client utility — used by all MCP tools

const FHIR_BASE_URL = "https://launch.smarthealthit.org/v/r4/fhir";

/**
 * Make a FHIR API request
 * @param {string} path - The FHIR resource path (e.g., "Patient/abc123" or "Condition?patient=xyz")
 * @param {string} accessToken - The FHIR Bearer access token from SMART launch
 * @returns {Promise<object>} The parsed FHIR response
 */
export async function fhirRequest(path, accessToken) {
  if (!accessToken) {
    throw new Error("FHIR access token is required");
  }

  const url = `${FHIR_BASE_URL}/${path}`;

  const response = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Accept": "application/fhir+json"
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`FHIR request failed: ${response.status} ${response.statusText} - ${body}`);
  }

  return await response.json();
}

/**
 * Unwrap a FHIR Bundle into a flat array of resources
 * @param {object} bundle - A FHIR Bundle resource
 * @returns {array} Array of resources from the bundle
 */
export function unwrapBundle(bundle) {
  if (!bundle || bundle.resourceType !== "Bundle") {
    return [];
  }
  return (bundle.entry || []).map(e => e.resource).filter(Boolean);
}
