import { NextRequest, NextResponse } from "next/server";
import { getAirwallexToken, AIRWALLEX_API_URL } from "@/lib/airwallex";
import {
  getIncidentSession,
  updateIncidentSession,
  addIncidentEvent,
} from "@/lib/cooyor/incident-session";

export async function GET(request: NextRequest) {
  try {
    const incident_id = request.nextUrl.searchParams.get("incident_id");

    if (!incident_id) {
      return NextResponse.json(
        {
          success: false,
          error: "incident_id is required",
        },
        { status: 400 }
      );
    }

    const session = getIncidentSession(incident_id);

    if (!session || !session.replacement_transfer_id) {
      return NextResponse.json(
        {
          success: false,
          error: "Replacement payment not found",
        },
        { status: 404 }
      );
    }

    const token = await getAirwallexToken();

    const response = await fetch(
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

    const data = await response.json();

    if (!response.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "Failed to fetch replacement status",
          airwallex_status: response.status,
          airwallex_response: data,
        },
        { status: 502 }
      );
    }

    const replacementStatus = data.status;

    /*
     * PROCESSING is a legitimate intermediate Airwallex status.
     * It means the replacement exists and is being processed.
     *
     * Never move the incident backwards to FAILED here.
     */

    if (
      replacementStatus === "PROCESSING" ||
      replacementStatus === "SCHEDULED"
    ) {
      if (session.stage === "FAILED") {
        updateIncidentSession(incident_id, {
          stage: "REPLACING",
        });
      }
    }

    if (replacementStatus === "SENT") {
      if (session.stage !== "REPLACEMENT_SENT") {
        updateIncidentSession(incident_id, {
          stage: "REPLACEMENT_SENT",
        });

        addIncidentEvent(
          incident_id,
          "REPLACEMENT_SENT",
          "Protected replacement payment reached SENT status."
        );
      }
    }

    if (replacementStatus === "PAID") {
      if (
        session.stage !== "REPLACEMENT_SENT" &&
        session.stage !== "RESOLVED"
      ) {
        updateIncidentSession(incident_id, {
          stage: "REPLACEMENT_SENT",
        });
      }

      const alreadyRecorded = session.events.some(
        (event) => event.type === "REPLACEMENT_PAID"
      );

      if (!alreadyRecorded) {
        addIncidentEvent(
          incident_id,
          "REPLACEMENT_PAID",
          "Protected replacement payment was successfully paid."
        );
      }
    }

    const updatedSession = getIncidentSession(incident_id);

    return NextResponse.json({
      success: true,
      replacement: {
        transfer_id: session.replacement_transfer_id,
        reference: session.replacement_reference,
        status: replacementStatus,
        amount: session.amount,
        currency: session.currency,
      },
      incident: updatedSession,
    });
  } catch (error) {
    console.error("REPLACEMENT STATUS ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown replacement status error",
      },
      { status: 500 }
    );
  }
}