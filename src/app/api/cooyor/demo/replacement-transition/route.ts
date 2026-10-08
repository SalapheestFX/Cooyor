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

    if (!["SENT", "PAID"].includes(next_status)) {
      return NextResponse.json(
        {
          success: false,
          error: "next_status must be SENT or PAID",
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

    if (!session.replacement_transfer_id) {
      return NextResponse.json(
        {
          success: false,
          error: "Replacement payment not found",
        },
        { status: 404 }
      );
    }

    const token = await getAirwallexToken();

    // Read the EXISTING replacement first.
    const currentResponse = await fetch(
      `${AIRWALLEX_API_URL}/api/v1/transfers/${session.replacement_transfer_id}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    );

    const current = await currentResponse.json();

    if (!currentResponse.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "Could not read replacement transfer.",
          airwallex_response: current,
        },
        { status: 502 }
      );
    }

    const currentStatus = current.status;

    // SENT can be simulated from the sandbox's PROCESSING/SCHEDULED state.
    if (
      next_status === "SENT" &&
      !["PROCESSING", "SCHEDULED"].includes(currentStatus)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: `Replacement cannot move to SENT from ${currentStatus}.`,
          current_status: currentStatus,
        },
        { status: 400 }
      );
    }

    // PAID must follow SENT.
    if (next_status === "PAID" && currentStatus !== "SENT") {
      return NextResponse.json(
        {
          success: false,
          error: `Replacement cannot move to PAID from ${currentStatus}.`,
          current_status: currentStatus,
        },
        { status: 400 }
      );
    }

    const simulationResponse = await fetch(
      `${AIRWALLEX_API_URL}/api/v1/simulation/transfers/${session.replacement_transfer_id}/transition`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          next_status,
        }),
        cache: "no-store",
      }
    );

    const responseText = await simulationResponse.text();

    console.log(
      "AIRWALLEX REPLACEMENT TRANSITION STATUS:",
      simulationResponse.status
    );

    console.log(
      "AIRWALLEX REPLACEMENT TRANSITION RESPONSE:",
      responseText
    );

    if (!simulationResponse.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "Airwallex replacement transition failed",
          airwallex_status: simulationResponse.status,
          airwallex_response: responseText,
        },
        { status: 502 }
      );
    }

    let airwallexData;

    try {
      airwallexData = JSON.parse(responseText);
    } catch {
      airwallexData = { raw: responseText };
    }

    if (next_status === "SENT") {
      updateIncidentSession(incident_id, {
        stage: "REPLACEMENT_SENT",
      });

      addIncidentEvent(
        incident_id,
        "REPLACEMENT_SENT",
        "Protected replacement payment reached SENT status."
      );
    }

    if (next_status === "PAID") {
      updateIncidentSession(incident_id, {
        stage: "REPLACEMENT_SENT",
      });

      addIncidentEvent(
        incident_id,
        "REPLACEMENT_PAID",
        "Protected replacement payment was successfully paid."
      );
    }

    return NextResponse.json({
      success: true,
      incident_id,
      next_status,
      airwallex: airwallexData,
      incident: getIncidentSession(incident_id),
    });
  } catch (error) {
    console.error("REPLACEMENT TRANSITION ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown replacement transition error",
      },
      { status: 500 }
    );
  }
}