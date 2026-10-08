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

    const response = await fetch(
      `${AIRWALLEX_API_URL}/api/v1/transfers/${session.original_transfer_id}`,
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
          error: "Failed to fetch Airwallex transfer",
          airwallex_status: response.status,
          airwallex_response: data,
        },
        { status: 502 }
      );
    }

    const originalStatus = data.status;
    const failureType =
      data.failure?.details?.type ??
      data.failure?.type ??
      null;

    const failureReason =
      data.failure?.message ??
      data.failure?.details?.message ??
      null;

    /*
     * IMPORTANT:
     *
     * Once a replacement has been created, refreshing the original
     * payment must NEVER move the incident backwards to FAILED.
     *
     * The original payment is already final at that point.
     */
    const replacementExists = Boolean(session.replacement_transfer_id);

    if (!replacementExists) {
      if (originalStatus === "SENT" && session.stage === "CREATED") {
        updateIncidentSession(incident_id, {
          stage: "SENT",
        });

        addIncidentEvent(
          incident_id,
          "PAYMENT_SENT",
          "Supplier payment reached SENT status."
        );
      }

      if (
        originalStatus === "CANCELLED" &&
        session.stage !== "DECIDING" &&
        session.stage !== "REPLACING" &&
        session.stage !== "REPLACEMENT_SENT" &&
        session.stage !== "RESOLVED"
      ) {
        updateIncidentSession(incident_id, {
          stage: "DECIDING",
          failure_type: failureType,
          failure_reason: failureReason,
        });

        addIncidentEvent(
          incident_id,
          "BANK_RETURN_DETECTED",
          `The beneficiary bank returned the payment${
            failureReason ? `: ${failureReason}` : "."
          }`
        );

        addIncidentEvent(
          incident_id,
          "EVIDENCE_ANALYSIS_STARTED",
          "Cooyor is analyzing the failure evidence and deciding whether to replace or escalate."
        );
      }
    }

    /*
     * Once replacement exists, preserve the replacement workflow.
     * The original payment being CANCELLED is expected and should
     * not overwrite the current incident stage.
     */
    if (replacementExists) {
      if (
        session.stage === "FAILED" ||
        session.stage === "DECIDING"
      ) {
        updateIncidentSession(incident_id, {
          stage:
            session.final_decision === "REPLACE"
              ? "REPLACING"
              : session.stage,
          failure_type:
            session.failure_type ?? failureType,
          failure_reason:
            session.failure_reason ?? failureReason,
        });
      }
    }

    const updatedSession = getIncidentSession(incident_id);

    return NextResponse.json({
      success: true,
      incident: {
        incident_id: updatedSession?.incident_id,
        supplier_name: updatedSession?.supplier_name,
        amount: updatedSession?.amount,
        currency: updatedSession?.currency,

        original: {
          transfer_id: session.original_transfer_id,
          reference: session.original_reference,
          status: originalStatus,
          failure_type: failureType,
          failure_reason: failureReason,
        },

        replacement: updatedSession?.replacement_transfer_id
          ? {
              transfer_id: updatedSession.replacement_transfer_id,
              reference: updatedSession.replacement_reference,
            }
          : null,

        stage: updatedSession?.stage,
        decision: updatedSession?.final_decision,
        resolved: updatedSession?.resolved,
        events: updatedSession?.events ?? [],
      },
    });
  } catch (error) {
    console.error("DEMO STATUS ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown status error",
      },
      { status: 500 }
    );
  }
}