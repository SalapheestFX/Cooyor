import { NextResponse } from "next/server";
import { getAirwallexToken, AIRWALLEX_API_URL } from "@/lib/airwallex";
import {
  createIncidentSession,
  getIncidentSession,
  updateIncidentSession,
  addIncidentEvent,
} from "@/lib/cooyor/incident-session";

const ORIGINAL_TRANSFER_ID =
  "eeb4a7d1-8892-4bbe-88a9-5ac2e9562748";

const ORIGINAL_REFERENCE =
  "COOYOR-4915d6aa-55e3-466f-8f55-f2462756454c";

const REPLACEMENT_TRANSFER_ID =
  "ae03f744-efd3-48b7-8226-92c9abcc0a3f";

const REPLACEMENT_REFERENCE =
  "COOYOR-REPLACEMENT-77ec1cb3-8b06-49b9-b2fe-274c706a7d91";

export async function POST() {
  try {
    const incident_id = `INC-${ORIGINAL_TRANSFER_ID}`;

    const existing = getIncidentSession(incident_id);

    if (existing) {
      return NextResponse.json({
        success: true,
        recovered: false,
        message: "Incident already exists in memory.",
        incident: existing,
      });
    }

    const token = await getAirwallexToken();

    const originalResponse = await fetch(
      `${AIRWALLEX_API_URL}/api/v1/transfers/${ORIGINAL_TRANSFER_ID}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    );

    const replacementResponse = await fetch(
      `${AIRWALLEX_API_URL}/api/v1/transfers/${REPLACEMENT_TRANSFER_ID}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    );

    const original = await originalResponse.json();
    const replacement = await replacementResponse.json();

    if (!originalResponse.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "Could not recover original transfer.",
          airwallex: original,
        },
        { status: 502 }
      );
    }

    if (!replacementResponse.ok) {
      return NextResponse.json(
        {
          success: false,
          error: "Could not recover replacement transfer.",
          airwallex: replacement,
        },
        { status: 502 }
      );
    }

    const session = createIncidentSession({
      original_transfer_id: ORIGINAL_TRANSFER_ID,
      original_reference: ORIGINAL_REFERENCE,
      amount: 100,
      currency: "USD",
      supplier_name: "Cooyor Demo Supplier",
    });

    updateIncidentSession(incident_id, {
      replacement_transfer_id: REPLACEMENT_TRANSFER_ID,
      replacement_reference: REPLACEMENT_REFERENCE,
      stage:
        replacement.status === "PAID"
          ? "REPLACEMENT_SENT"
          : "REPLACING",
      initial_decision: "WAIT",
      final_decision: "REPLACE",
      failure_type:
        original.failure?.details?.type ?? "INCORRECT_ROUTING",
      failure_reason:
        original.failure?.message ?? "Beneficiary bank returned",
      duplicate_lock_acquired: true,
    });

    addIncidentEvent(
      incident_id,
      "INCIDENT_RECOVERED",
      "Cooyor recovered the existing payment incident from Airwallex after a server restart."
    );

    addIncidentEvent(
      incident_id,
      "ORIGINAL_PAYMENT_FINAL",
      "Original payment is final with an incorrect-routing bank return."
    );

    addIncidentEvent(
      incident_id,
      "REPLACEMENT_RECOVERED",
      `Existing protected replacement recovered. Current status: ${replacement.status}.`
    );

    const recovered = getIncidentSession(incident_id);

    return NextResponse.json({
      success: true,
      recovered: true,
      incident: recovered,
      original: {
        transfer_id: ORIGINAL_TRANSFER_ID,
        status: original.status,
      },
      replacement: {
        transfer_id: REPLACEMENT_TRANSFER_ID,
        status: replacement.status,
      },
    });
  } catch (error) {
    console.error("RECOVERY ERROR:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown recovery error",
      },
      { status: 500 }
    );
  }
}