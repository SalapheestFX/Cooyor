import { NextResponse } from "next/server";
import {
  listIncidentSessions,
} from "@/lib/cooyor/incident-session";

export async function GET() {
  try {
    const sessions = listIncidentSessions();

    const sortedSessions = [...sessions].sort(
      (a, b) =>
        new Date(b.created_at).getTime() -
        new Date(a.created_at).getTime()
    );

    return NextResponse.json({
      success: true,
      sessions: sortedSessions,
      latest: sortedSessions[0] ?? null,
    });
  } catch (error) {
    console.error(
      "Cooyor sessions error:",
      error
    );

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unable to load incident sessions.",
      },
      { status: 500 }
    );
  }
}