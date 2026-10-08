import { NextResponse } from "next/server";
import {
  AIRWALLEX_API_URL,
  getAirwallexToken,
} from "@/lib/airwallex";
import {
  saveIncidentRecord,
} from "@/lib/cooyor/incident-record";

const ORIGINAL_TRANSFER_ID =
  "b69436de-22fe-4ffc-b1cc-7318025089f9";

const REPLACEMENT_REFERENCE_PREFIX =
  "COOYOR-REPLACEMENT-";

export async function GET() {
  try {
    const token = await getAirwallexToken();

    const response = await fetch(
      `${AIRWALLEX_API_URL}/api/v1/transfers`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
        },
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
        { status: response.status }
      );
    }

    const transfers = data.items ?? [];

    const originalTransfer = transfers.find(
      (item: any) =>
        item.id === ORIGINAL_TRANSFER_ID
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

    const replacementTransfer = transfers.find(
      (item: any) =>
        item.reference?.startsWith(
          REPLACEMENT_REFERENCE_PREFIX
        ) &&
        item.id !== ORIGINAL_TRANSFER_ID
    );

    if (!replacementTransfer) {
      return NextResponse.json({
        success: true,
        resolved: false,
        message:
          "No replacement transfer found yet.",
      });
    }

    const replacementPaid =
      replacementTransfer.status === "PAID";

    const resolved =
      originalTransfer.status === "CANCELLED" &&
      replacementPaid;

    const record = saveIncidentRecord({
      incident_id:
        `INC-${ORIGINAL_TRANSFER_ID}`,

      original_transfer_id:
        originalTransfer.id,

      replacement_transfer_id:
        replacementTransfer.id,

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
        replacementTransfer.status,

      amount:
        replacementTransfer.transfer_amount,

      currency:
        replacementTransfer.transfer_currency,

      resolved,

      resolved_at:
        resolved
          ? new Date().toISOString()
          : null,
    });

    return NextResponse.json({
      success: true,

      resolved,

      incident: {
        id: record.incident_id,

        original: {
          transfer_id:
            record.original_transfer_id,

          status:
            record.original_status,

          failure_type:
            record.failure_type,

          failure_reason:
            record.failure_reason,
        },

        decision:
          record.decision,

        replacement: {
          transfer_id:
            record.replacement_transfer_id,

          status:
            record.replacement_status,

          amount:
            record.amount,

          currency:
            record.currency,
        },
      },

      resolution: resolved
        ? {
            status: "RESOLVED",
            message:
              "Original payment failed and the protected replacement was successfully paid.",
          }
        : {
            status: "OPEN",
            message:
              "Replacement exists but has not reached PAID yet.",
          },
    });
  } catch (error) {
    console.error(
      "Cooyor incident resolution error:",
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