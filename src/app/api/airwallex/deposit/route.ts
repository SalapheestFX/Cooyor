import { NextResponse } from "next/server";
import {
  AIRWALLEX_API_URL,
  getAirwallexToken,
} from "@/lib/airwallex";

export async function POST() {
  try {
    const token = await getAirwallexToken();

    const response = await fetch(
      `${AIRWALLEX_API_URL}/api/v1/simulation/deposit/create`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          global_account_id:
            "5ccaa0ae-d17d-4f7c-9670-1d8103aa5626",
          amount: 25000,
          payer_name: "Cooyor Seed Funding",
        }),
        cache: "no-store",
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: data },
        { status: response.status }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Cooyor sandbox wallet funded",
      deposit: data,
    });
  } catch (error) {
    console.error("Airwallex deposit error:", error);

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}