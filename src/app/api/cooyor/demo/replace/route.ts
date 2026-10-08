import { NextResponse } from "next/server";
import { getAirwallexToken, AIRWALLEX_API_URL } from "@/lib/airwallex";
import {
  getIncidentSession,
  updateIncidentSession,
  addIncidentEvent,
} from "@/lib/cooyor/incident-session";
import {
  acquireReplacementLock,
  hasReplacementLock,
} from "@/lib/cooyor/incident-lock";

const BENEFICIARY_ID =
  "9d9ef492-178a-4115-9564-7ddcaba63616";

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

    if (session.final_decision !== "REPLACE") {
      return NextResponse.json(
        {
          success: false,
          error: "Replacement is not authorized for this incident.",
        },
        { status: 409 }
      );
    }

    if (session.replacement_transfer_id) {
      return NextResponse.json(
        {
          success: false,
          error: "A replacement payment already exists for this incident.",
          replacement_transfer_id:
            session.replacement_transfer_id,
        },
        { status: 409 }
      );
    }

    if (hasReplacementLock(session.original_transfer_id)) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Duplicate protection blocked another replacement attempt.",
        },
        { status: 409 }
      );
    }

    const token = await getAirwallexToken();

    /*
     * Read the original transfer directly from Airwallex
     * before creating any replacement.
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

    const originalStatus = original.status;

    const failureType =
      original.failure?.details?.type ??
      original.failure_type ??
      session.failure_type;

    if (originalStatus !== "CANCELLED") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Replacement blocked because the original payment is not final.",
          original_status: originalStatus,
        },
        { status: 409 }
      );
    }

    if (failureType !== "INCORRECT_ROUTING") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Replacement blocked because the failure type is not eligible.",
          failure_type: failureType,
        },
        { status: 409 }
      );
    }

    /*
     * Acquire the duplicate lock immediately before
     * creating the replacement payment.
     */
    const lockAcquired = acquireReplacementLock(
      session.original_transfer_id
    );

    if (!lockAcquired) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Duplicate protection blocked another replacement attempt.",
        },
        { status: 409 }
      );
    }

    const requestId = crypto.randomUUID();
    const reference = `COOYOR-REPLACEMENT-${crypto.randomUUID()}`;

    const replacementResponse = await fetch(
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
          transfer_amount: session.amount,
          transfer_currency: session.currency,
          source_currency: session.currency,
          transfer_method: "LOCAL",
          reason: "Cooyor protected replacement payment",
        }),
        cache: "no-store",
      }
    );

    const replacement = await replacementResponse.json();

    if (!replacementResponse.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "Replacement payment creation failed.",
          details: replacement,
        },
        { status: replacementResponse.status }
      );
    }

    if (!replacement.id) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Airwallex did not return a replacement transfer ID.",
          details: replacement,
        },
        { status: 502 }
      );
    }

    updateIncidentSession(incidentId, {
      replacement_transfer_id: replacement.id,
      replacement_reference: reference,
      stage: "REPLACING",
      duplicate_lock_acquired: true,
    });

    addIncidentEvent(
      incidentId,
      "DUPLICATE_LOCK_ACQUIRED",
      "Replacement execution protected by a duplicate-payment lock."
    );

    addIncidentEvent(
      incidentId,
      "REPLACEMENT_CREATED",
      `Protected replacement payment created with reference ${reference}.`
    );

    return NextResponse.json({
      success: true,

      replacement: {
        transfer_id: replacement.id,
        reference,
        request_id: requestId,
        status: replacement.status ?? "SCHEDULED",
        amount: session.amount,
        currency: session.currency,
      },

      incident: getIncidentSession(incidentId),
    });
  } catch (error) {
    console.error("Cooyor replacement error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to create protected replacement.",
      },
      { status: 500 }
    );
  }
}