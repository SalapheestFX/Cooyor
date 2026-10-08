import { NextResponse } from "next/server";
import {
  AIRWALLEX_API_URL,
  getAirwallexToken,
} from "@/lib/airwallex";

export async function POST() {
  try {
    const token = await getAirwallexToken();

    const response = await fetch(
      `${AIRWALLEX_API_URL}/api/v1/beneficiaries/create`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          request_id: crypto.randomUUID(),

          beneficiary: {
            entity_type: "COMPANY",
            company_name: "Cooyor Demo Supplier",
            first_name: "Cooyor",
            last_name: "Supplier",

            address: {
              country_code: "US",
              street_address: "123 Demo Street",
              city: "New York",
              state: "NY",
              postcode: "10001",
            },

            bank_details: {
              bank_country_code: "US",
              account_currency: "USD",
              bank_name: "Cooyor Demo Bank",
              account_name: "Cooyor Demo Supplier",
              account_number: "1234567890",
              account_routing_type1: "aba",
              account_routing_value1: "021000021",
              bank_account_category: "Checking",
            },
          },

          transfer_methods: ["LOCAL"],
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
      message: "Cooyor beneficiary created",
      beneficiary: data,
    });
  } catch (error) {
    console.error("Airwallex beneficiary error:", error);

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