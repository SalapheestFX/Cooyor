import { NextResponse } from "next/server";
import {
  AIRWALLEX_API_URL,
  getAirwallexToken,
} from "@/lib/airwallex";

export async function GET() {
  try {
    const token = await getAirwallexToken();

    const response = await fetch(
      `${AIRWALLEX_API_URL}/api/v1/global_accounts`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
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
      accounts: data,
    });
  } catch (error) {
    console.error("Global account error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}