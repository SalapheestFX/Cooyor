import { NextResponse } from "next/server";
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

    if (session.stage !== "DECIDING") {
      return NextResponse.json(
        {
          success: false,
          error: `Cooyor cannot make a decision from stage ${session.stage}.`,
        },
        { status: 409 }
      );
    }

    if (!session.failure_type) {
      return NextResponse.json(
        {
          success: false,
          error: "No failure evidence is available.",
        },
        { status: 409 }
      );
    }

    /*
     * Cooyor decision policy:
     *
     * Incorrect routing / beneficiary bank return:
     * → REPLACE
     *
     * Unknown or unsupported failure:
     * → ESCALATE
     *
     * The model is not allowed to directly move money.
     * This policy produces a typed decision which the
     * payment execution layer will enforce.
     */

    let decision: "REPLACE" | "ESCALATE";
    let reason: string;

    if (session.failure_type === "INCORRECT_ROUTING") {
      decision = "REPLACE";

      reason =
        "The payment was returned because of an incorrect routing condition. A protected replacement is safer than waiting indefinitely.";
    } else {
      decision = "ESCALATE";

      reason =
        "The failure type is not covered by Cooyor's automatic replacement policy, so human review is required.";
    }

    updateIncidentSession(incidentId, {
      initial_decision: "WAIT",
      final_decision: decision,
      stage: decision === "REPLACE" ? "REPLACING" : "DECIDING",
    });

    addIncidentEvent(
      incidentId,
      "EVIDENCE_ANALYZED",
      `Failure classified as ${session.failure_type}.`
    );

    addIncidentEvent(
      incidentId,
      "DECISION_MADE",
      `Cooyor decision: ${decision}. ${reason}`
    );

    return NextResponse.json({
      success: true,

      decision: {
        action: decision,
        reason,
        failure_type: session.failure_type,
        failure_reason: session.failure_reason,
      },

      incident: getIncidentSession(incidentId),
    });
  } catch (error) {
    console.error("Cooyor decision error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to make incident decision.",
      },
      { status: 500 }
    );
  }
}