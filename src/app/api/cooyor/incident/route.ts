import { NextResponse } from "next/server";
import {
  AIRWALLEX_API_URL,
  getAirwallexToken,
} from "@/lib/airwallex";

const ORIGINAL_TRANSFER_ID =
  "b69436de-22fe-4ffc-b1cc-7318025089f9";

type IncidentDecision = "WAIT" | "REPLACE" | "ESCALATE";

function decideAction(transfer: any): IncidentDecision {
  const failureType = transfer?.failure?.details?.type;

  // Deterministic safety rules.
  if (transfer?.status !== "CANCELLED") {
    return "WAIT";
  }

  if (!failureType) {
    return "ESCALATE";
  }

  // Known recoverable bank-routing failure.
  if (failureType === "INCORRECT_ROUTING") {
    return "REPLACE";
  }

  return "ESCALATE";
}

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
        {
          status: response.status,
        }
      );
    }

    const transfer = data.items?.find(
      (item: any) => item.id === ORIGINAL_TRANSFER_ID
    );

    if (!transfer) {
      return NextResponse.json(
        {
          success: false,
          error: "Original transfer not found",
        },
        {
          status: 404,
        }
      );
    }

    const decision = decideAction(transfer);

    return NextResponse.json({
      success: true,

      incident: {
        transfer_id: transfer.id,
        status: transfer.status,
        amount: transfer.transfer_amount,
        currency: transfer.transfer_currency,

        failure: {
          type: transfer.failure?.details?.type ?? null,
          code: transfer.failure?.code ?? null,
          message: transfer.failure?.message ?? null,
        },

        decision,

        reason:
          decision === "REPLACE"
            ? "The beneficiary bank returned the payment because of incorrect routing. A replacement can be considered after safety checks."
            : decision === "WAIT"
              ? "The transfer is not yet in a failed terminal state."
              : "The incident requires human review before another payment is attempted.",
      },
    });
  } catch (error) {
    console.error("Cooyor Incident Commander error:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error",
      },
      {
        status: 500,
      }
    );
  }
}