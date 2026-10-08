import { NextResponse } from "next/server";
import {
  AIRWALLEX_API_URL,
  getAirwallexToken,
} from "@/lib/airwallex";

export async function POST() {
  try {
    const token = await getAirwallexToken();

    const response = await fetch(
      `${AIRWALLEX_API_URL}/api/v1/beneficiaries/schema`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          beneficiary: {
            entity_type: "COMPANY",
            address: {
              country_code: "US",
            },
            bank_details: {
              bank_country_code: "US",
              account_currency: "USD",
            },
          },

          transfer_methods: ["LOCAL"],

          payment_methods: ["LOCAL"],
        }),

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
        {
          status: response.status,
        }
      );
    }

    return NextResponse.json({
      success: true,
      schema: data,
    });
  } catch (error) {
    console.error("Airwallex beneficiary schema error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error",
      },
      {
        status: 500,
      }
    );
  }
}