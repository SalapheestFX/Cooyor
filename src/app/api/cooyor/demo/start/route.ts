import { NextResponse } from "next/server";
import { getAirwallexToken, AIRWALLEX_API_URL } from "@/lib/airwallex";
import {
  createIncidentSession,
  addIncidentEvent,
} from "@/lib/cooyor/incident-session";

const BENEFICIARY_ID =
  "9d9ef492-178a-4115-9564-7ddcaba63616";

const SUPPLIER_NAME = "Cooyor Demo Supplier";

export async function POST() {
  try {
    const token = await getAirwallexToken();

    const requestId = crypto.randomUUID();

    const reference = `COOYOR-${crypto.randomUUID()}`;

    const response = await fetch(
      `${AIRWALLEX_API_URL}/api/v1/transfers/create`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          request_id: requestId,
          reference,

          beneficiary_id: BENEFICIARY_ID,

          transfer_amount: 100,
          transfer_currency: "USD",
          source_currency: "USD",

          transfer_method: "LOCAL",

          reason: "Cooyor Payment Operations Incident Demo",
        }),
        cache: "no-store",
      }
    );

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "Airwallex transfer creation failed.",
          details: data,
        },
        { status: response.status }
      );
    }

    const transferId = data.id;

    if (!transferId) {
      return NextResponse.json(
        {
          success: false,
          error: "Airwallex did not return a transfer ID.",
          details: data,
        },
        { status: 502 }
      );
    }

    const session = createIncidentSession({
      original_transfer_id: transferId,
      original_reference: reference,
      amount: 100,
      currency: "USD",
      supplier_name: SUPPLIER_NAME,
    });

    addIncidentEvent(
      session.incident_id,
      "COOYOR_MONITORING_STARTED",
      "Cooyor is now monitoring the supplier payment."
    );

    return NextResponse.json({
      success: true,

      incident: {
        incident_id: session.incident_id,

        supplier_name: SUPPLIER_NAME,

        amount: 100,
        currency: "USD",

        transfer_id: transferId,
        reference,

        status: data.status ?? "SCHEDULED",

        stage: session.stage,
      },

      airwallex: {
        transfer_id: transferId,
        status: data.status ?? "SCHEDULED",
        request_id: requestId,
        reference,
      },
    });
  } catch (error) {
    console.error("Cooyor start payment error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to start payment.",
      },
      { status: 500 }
    );
  }
}