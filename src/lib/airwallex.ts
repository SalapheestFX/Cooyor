const AIRWALLEX_API_URL =
  process.env.AIRWALLEX_API_URL || "https://api.sandbox.airwallex.com";

export async function getAirwallexToken(): Promise<string> {
  const response = await fetch(
    `${AIRWALLEX_API_URL}/api/v1/authentication/login`,
    {
      method: "POST",
      headers: {
        "x-client-id": process.env.AIRWALLEX_CLIENT_ID!,
        "x-api-key": process.env.AIRWALLEX_API_KEY!,
      },
      cache: "no-store",
    }
  );

  const data = await response.json();

  if (!response.ok || !data.token) {
    throw new Error(
      `Airwallex authentication failed: ${JSON.stringify(data)}`
    );
  }

  return data.token;
}

export { AIRWALLEX_API_URL };