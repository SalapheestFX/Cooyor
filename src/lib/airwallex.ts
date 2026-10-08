const AIRWALLEX_API_URL =
  process.env.AIRWALLEX_API_URL ||
  "https://api.sandbox.airwallex.com";

export async function getAirwallexToken(): Promise<string> {
  const clientId = process.env.AIRWALLEX_CLIENT_ID;
  const apiKey = process.env.AIRWALLEX_API_KEY;

  if (!clientId) {
    throw new Error(
      "AIRWALLEX_CLIENT_ID is missing from the server environment."
    );
  }

  if (!apiKey) {
    throw new Error(
      "AIRWALLEX_API_KEY is missing from the server environment."
    );
  }

  const response = await fetch(
    `${AIRWALLEX_API_URL}/api/v1/authentication/login`,
    {
      method: "POST",
      headers: {
        "x-client-id": clientId,
        "x-api-key": apiKey,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    }
  );

  const contentType =
    response.headers.get("content-type") || "";

  const rawResponse = await response.text();

  let data: any;

  try {
    if (contentType.includes("application/json")) {
      data = JSON.parse(rawResponse);
    } else {
      data = {
        raw_response: rawResponse,
      };
    }
  } catch {
    data = {
      raw_response: rawResponse,
    };
  }

  if (!response.ok) {
    console.error(
      "AIRWALLEX AUTHENTICATION FAILED:",
      {
        status: response.status,
        content_type: contentType,
        response: data,
      }
    );

    throw new Error(
      `Airwallex authentication failed (${response.status}). ${
        data?.message ||
        data?.error ||
        data?.raw_response?.slice(0, 300) ||
        "Unknown authentication error."
      }`
    );
  }

  if (!data.token) {
    console.error(
      "AIRWALLEX AUTH RESPONSE DID NOT CONTAIN TOKEN:",
      data
    );

    throw new Error(
      "Airwallex authentication succeeded but no token was returned."
    );
  }

  return data.token;
}

export { AIRWALLEX_API_URL };