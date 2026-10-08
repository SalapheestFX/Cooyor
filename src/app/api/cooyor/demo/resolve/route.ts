import { NextResponse } from "next/server";
import { getAirwallexToken, AIRWALLEX_API_URL } from "@/lib/airwallex";
import {
  getIncidentSession,
  updateIncidentSession,
  addIncidentEvent,
} from "@/lib/cooyor/incident-session";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const incidentId = body.incident_id;

    if (!incidentId) {
      return NextResponse.json(
        {
          success: false,
          error: "incident_id is required.",
        },
        { status: 400 }
      );
    }

    const session = getIncidentSession(incidentId);

    if (!session) {
      return NextResponse.json(
        {
          success: false,
          error: "Incident session not found.",
        },
        { status: 404 }
      );
    }

    if (session.resolved) {
      return NextResponse.json({
        success: true,
        already_resolved: true,
        incident: session,
      });
    }

    if (session.final_decision !== "REPLACE") {
      return NextResponse.json(
        {
          success: false,
          error: "Incident does not have a REPLACE decision.",
        },
        { status: 409 }
      );
    }

    if (!session.replacement_transfer_id) {
      return NextResponse.json(
        {
          success: false,
          error: "No replacement payment exists.",
        },
        { status: 409 }
      );
    }

    if (!session.duplicate_lock_acquired) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Incident cannot be resolved without duplicate-payment protection.",
        },
        { status: 409 }
      );
    }

    const token = await getAirwallexToken();

    /*
     * Verify the ORIGINAL payment.
     */
    const originalResponse = await fetch(
      `${AIRWALLEX_API_URL}/api/v1/transfers/${session.original_transfer_id}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      }
    );

    const original = await originalResponse.json();

    if (!originalResponse.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "Unable to verify original payment.",
          details: original,
        },
        { status: originalResponse.status }
      );
    }

    /*
     * Verify the REPLACEMENT payment.
     */
    const replacementResponse = await fetch(
      `${AIRWALLEX_API_URL}/api/v1/transfers/${session.replacement_transfer_id}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      }
    );

    const replacement = await replacementResponse.json();

    if (!replacementResponse.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "Unable to verify replacement payment.",
          details: replacement,
        },
        { status: replacementResponse.status }
      );
    }

    const originalFailureType =
      original.failure?.details?.type ??
      original.failure_type ??
      session.failure_type;

    if (original.status !== "CANCELLED") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Incident cannot be resolved because the original payment is not final.",
          original_status: original.status,
        },
        { status: 409 }
      );
    }

    if (originalFailureType !== "INCORRECT_ROUTING") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Incident cannot be resolved because the original failure is not the expected routing failure.",
          failure_type: originalFailureType,
        },
        { status: 409 }
      );
    }

    if (replacement.status !== "PAID") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Incident cannot be resolved until the replacement is PAID.",
          replacement_status: replacement.status,
        },
        { status: 409 }
      );
    }

    const resolvedAt = new Date().toISOString();

    updateIncidentSession(incidentId, {
      stage: "RESOLVED",
      resolved: true,
      resolved_at: resolvedAt,
    });

    addIncidentEvent(
      incidentId,
      "INCIDENT_RESOLVED",
      "Original payment was returned and the protected replacement was successfully paid."
    );

    const resolvedSession =
      getIncidentSession(incidentId);

    return NextResponse.json({
      success: true,

      resolution: {
        status: "RESOLVED",
        message:
          "Payment incident resolved successfully.",
        resolved_at: resolvedAt,
      },

      original: {
        transfer_id: session.original_transfer_id,
        status: original.status,
        failure_type: originalFailureType,
        failure_reason:
          original.failure?.message ??
          session.failure_reason,
      },

      replacement: {
        transfer_id:
          session.replacement_transfer_id,
        status: replacement.status,
        amount: session.amount,
        currency: session.currency,
      },

      incident: resolvedSession,
    });
  } catch (error) {
    console.error("Cooyor resolve error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to resolve incident.",
      },
      { status: 500 }
    );
  }
}