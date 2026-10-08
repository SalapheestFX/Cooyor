import { NextResponse } from "next/server";
import {
  AIRWALLEX_API_URL,
  getAirwallexToken,
} from "@/lib/airwallex";
import {
  acquireReplacementLock,
  hasReplacementLock,
} from "@/lib/cooyor/incident-lock";
import {
  saveIncidentRecord,
} from "@/lib/cooyor/incident-record";

const ORIGINAL_TRANSFER_ID =
  "b69436de-22fe-4ffc-b1cc-7318025089f9";

const BENEFICIARY_ID =
  "9d9ef492-178a-4115-9564-7ddcaba63616";

export async function POST() {
  try {
    // 1. Duplicate protection.
    if (hasReplacementLock(ORIGINAL_TRANSFER_ID)) {
      return NextResponse.json(
        {
          success: false,
          error: "Replacement already created for this incident",
        },
        { status: 409 }
      );
    }

    const token = await getAirwallexToken();

    // 2. Retrieve the original transfer.
    const listResponse = await fetch(
      `${AIRWALLEX_API_URL}/api/v1/transfers`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        cache: "no-store",
      }
    );

    const listData = await listResponse.json();

    if (!listResponse.ok) {
      return NextResponse.json(
        {
          success: false,
          error: listData,
        },
        { status: listResponse.status }
      );
    }

    const originalTransfer = listData.items?.find(
      (item: any) => item.id === ORIGINAL_TRANSFER_ID
    );

    if (!originalTransfer) {
      return NextResponse.json(
        {
          success: false,
          error: "Original transfer not found",
        },
        { status: 404 }
      );
    }

    // 3. Safety checks.
    if (originalTransfer.status !== "CANCELLED") {
      return NextResponse.json(
        {
          success: false,
          error:
            "Original transfer is not in a terminal cancelled state",
        },
        { status: 409 }
      );
    }

    if (
      originalTransfer.failure?.details?.type !==
      "INCORRECT_ROUTING"
    ) {
      return NextResponse.json(
        {
          success: false,
          error:
            "Failure type is not approved for automatic replacement",
        },
        { status: 409 }
      );
    }

    // 4. Acquire duplicate lock.
    const lockAcquired = acquireReplacementLock(
      ORIGINAL_TRANSFER_ID
    );

    if (!lockAcquired) {
      return NextResponse.json(
        {
          success: false,
          error: "Replacement already created for this incident",
        },
        { status: 409 }
      );
    }

    // 5. New operation = new request_id.
    const replacementRequestId = crypto.randomUUID();

    const replacementReference =
      `COOYOR-REPLACEMENT-${crypto.randomUUID()}`;

    // 6. Create replacement transfer.
    const response = await fetch(
      `${AIRWALLEX_API_URL}/api/v1/transfers/create`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          request_id: replacementRequestId,

          reference: replacementReference,

          beneficiary_id: BENEFICIARY_ID,

          transfer_amount:
            originalTransfer.transfer_amount,

          transfer_currency:
            originalTransfer.transfer_currency,

          source_currency:
            originalTransfer.source_currency,

          transfer_method:
            originalTransfer.transfer_method,

          reason:
            "Cooyor automatic replacement after beneficiary bank return",
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
          original_transfer_id:
            ORIGINAL_TRANSFER_ID,
          replacement_request_id:
            replacementRequestId,
        },
        { status: response.status }
      );
    }

    // 7. Save the incident record.
    const incidentId = crypto.randomUUID();

    const record = saveIncidentRecord({
      incident_id: incidentId,

      original_transfer_id:
        ORIGINAL_TRANSFER_ID,

      replacement_transfer_id: data.id,

      decision: "REPLACE",

      failure_type:
        originalTransfer.failure?.details?.type ??
        "UNKNOWN",

      failure_reason:
        originalTransfer.failure?.message ??
        "Unknown failure",

      original_status:
        originalTransfer.status,

      replacement_status:
        data.status,

      amount:
        data.transfer_amount,

      currency:
        data.transfer_currency,

      resolved: false,

      resolved_at: null,
    });

    return NextResponse.json({
      success: true,

      decision: "REPLACE",

      incident: {
        id: record.incident_id,

        original_transfer_id:
          record.original_transfer_id,

        original_status:
          record.original_status,

        original_failure:
          record.failure_type,

        failure_reason:
          record.failure_reason,
      },

      replacement: {
        transfer_id:
          record.replacement_transfer_id,

        request_id:
          replacementRequestId,

        reference:
          replacementReference,

        amount:
          data.transfer_amount,

        currency:
          data.transfer_currency,

        status:
          data.status,
      },

      resolution: {
        resolved:
          record.resolved,

        message:
          "Replacement created. Incident remains open until the replacement reaches a terminal successful state.",
      },

      message:
        "Cooyor created a protected replacement transfer and recorded the incident.",
    });
  } catch (error) {
    console.error(
      "Cooyor replacement error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error",
      },
      { status: 500 }
    );
  }
}