import { NextResponse } from "next/server";

export async function POST() {
  try {
    const response = await fetch(
      `${process.env.AIRWALLEX_API_URL}/api/v1/authentication/login`,
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

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: data,
        },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Cooyor connected to Airwallex Sandbox",
      expires_in: data.expires_in,
    });
  } catch (error) {
    console.error("Airwallex authentication error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}