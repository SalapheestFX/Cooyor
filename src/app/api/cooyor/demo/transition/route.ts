import { NextRequest, NextResponse } from "next/server";
import { getAirwallexToken, AIRWALLEX_API_URL } from "@/lib/airwallex";
import {
  getIncidentSession,
  updateIncidentSession,
  addIncidentEvent,
} from "@/lib/cooyor/incident-session";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const incident_id = body.incident_id;
    const next_status = body.next_status;

    if (!incident_id || !next_status) {
      return NextResponse.json(
        {
          success: false,
          error: "incident_id and next_status are required",
        },
        { status: 400 }
      );
    }

    if (!["SENT", "FAILED"].includes(next_status)) {
      return NextResponse.json(
        {
          success: false,
          error: "next_status must be SENT or FAILED",
        },
        { status: 400 }
      );
    }

    const session = getIncidentSession(incident_id);

    if (!session) {
      return NextResponse.json(
        {
          success: false,
          error: "Incident session not found",
        },
        { status: 404 }
      );
    }

    const token = await getAirwallexToken();

    const airwallexResponse = await fetch(
      `${AIRWALLEX_API_URL}/api/v1/simulation/transfers/${session.original_transfer_id}/transition`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(
          next_status === "FAILED"
            ? {
                next_status: "FAILED",
                failure_type: "BENEFICIARY_BANK_RETURNED",
              }
            : {
                next_status: "SENT",
              }
        ),
        cache: "no-store",
      }
    );

    const responseText = await airwallexResponse.text();

    console.log(
      "AIRWALLEX TRANSITION STATUS:",
      airwallexResponse.status
    );

    console.log(
      "AIRWALLEX TRANSITION RESPONSE:",
      responseText
    );

    if (!airwallexResponse.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "Airwallex simulation transition failed",
          airwallex_status: airwallexResponse.status,
          airwallex_response: responseText,
        },
        { status: 502 }
      );
    }

    let data;

    try {
      data = JSON.parse(responseText);
    } catch {
      data = { raw: responseText };
    }

    if (next_status === "SENT") {
      updateIncidentSession(incident_id, {
        stage: "SENT",
      });

      addIncidentEvent(
        incident_id,
        "PAYMENT_SENT",
        "Supplier payment reached SENT status."
      );
    }

    if (next_status === "FAILED") {
      updateIncidentSession(incident_id, {
        stage: "DECIDING",
        failure_type: "INCORRECT_ROUTING",
        failure_reason: "Beneficiary bank returned",
      });

      addIncidentEvent(
        incident_id,
        "BANK_RETURN_DETECTED",
        "The beneficiary bank returned the payment."
      );

      addIncidentEvent(
        incident_id,
        "EVIDENCE_ANALYSIS_STARTED",
        "Cooyor is analyzing the failure evidence and deciding whether to replace or escalate."
      );
    }

    return NextResponse.json({
      success: true,
      incident_id,
      next_status,
      airwallex: data,
      incident: getIncidentSession(incident_id),
    });
  } catch (error) {
    console.error("TRANSITION ROUTE ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown transition error",
      },
      { status: 500 }
    );
  }
}