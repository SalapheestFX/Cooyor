"use client";

import { useEffect, useMemo, useState } from "react";

type Stage =
  | "CREATED"
  | "SENT"
  | "FAILED"
  | "DECIDING"
  | "REPLACING"
  | "REPLACEMENT_SENT"
  | "RESOLVED";

type Event = {
  id: string;
  type: string;
  message: string;
  created_at: string;
};

type Incident = {
  incident_id: string;
  original_transfer_id: string;
  original_reference: string;
  replacement_transfer_id: string | null;
  replacement_reference: string | null;
  amount: number;
  currency: string;
  supplier_name: string;
  stage: Stage;
  initial_decision: "WAIT" | null;
  final_decision: "REPLACE" | "ESCALATE" | null;
  failure_type: string | null;
  failure_reason: string | null;
  duplicate_lock_acquired: boolean;
  resolved: boolean;
  resolved_at: string | null;
  events: Event[];
  created_at: string;
};

type ApiResult = {
  success: boolean;
  incident?: Partial<Incident> & {
    events?: Event[];
  };
  latest?: (Partial<Incident> & {
    events?: Event[];
  }) | null;
  error?: string;
};

const stageLabels: Record<Stage, string> = {
  CREATED: "Monitoring",
  SENT: "Payment sent",
  FAILED: "Bank return",
  DECIDING: "Analyzing",
  REPLACING: "Replacing",
  REPLACEMENT_SENT: "Verifying",
  RESOLVED: "Resolved",
};

function normalizeIncident(
  raw: Partial<Incident> & { events?: Event[] }
): Incident {
  return {
    incident_id: raw.incident_id ?? "",
    original_transfer_id:
      raw.original_transfer_id ?? "",
    original_reference:
      raw.original_reference ?? "",
    replacement_transfer_id:
      raw.replacement_transfer_id ?? null,
    replacement_reference:
      raw.replacement_reference ?? null,
    amount: raw.amount ?? 0,
    currency: raw.currency ?? "USD",
    supplier_name:
      raw.supplier_name ?? "Cooyor Demo Supplier",
    stage: raw.stage ?? "CREATED",
    initial_decision:
      raw.initial_decision ?? null,
    final_decision:
      raw.final_decision ?? null,
    failure_type:
      raw.failure_type ?? null,
    failure_reason:
      raw.failure_reason ?? null,
    duplicate_lock_acquired:
      raw.duplicate_lock_acquired ?? false,
    resolved: raw.resolved ?? false,
    resolved_at:
      raw.resolved_at ?? null,
    events: Array.isArray(raw.events)
      ? raw.events
      : [],
    created_at:
      raw.created_at ?? new Date().toISOString(),
  };
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function statusLabel(stage: Stage) {
  return stageLabels[stage];
}

function formatEventType(type: string) {
  return type
    .toLowerCase()
    .split("_")
    .map(
      (word) =>
        word.charAt(0).toUpperCase() +
        word.slice(1)
    )
    .join(" ");
}

export default function Home() {
  const [incident, setIncident] =
    useState<Incident | null>(null);

  const [busy, setBusy] = useState(false);

  const [message, setMessage] = useState(
    "Ready to monitor a supplier payment."
  );

  const [error, setError] = useState("");

  const currentStatus = useMemo(() => {
    if (!incident) {
      return "READY";
    }

    return statusLabel(incident.stage);
  }, [incident]);

  const canSend =
    !busy && incident === null;

  const canSendToBank =
    !busy &&
    incident !== null &&
    incident.stage === "CREATED";

  const canDetectReturn =
    !busy &&
    incident !== null &&
    incident.stage === "SENT";

  const canDecide =
    !busy &&
    incident !== null &&
    incident.stage === "DECIDING";

  const canReplace =
    !busy &&
    incident !== null &&
    incident.stage === "REPLACING" &&
    incident.final_decision === "REPLACE" &&
    incident.replacement_transfer_id === null;

  const canSendReplacement =
    !busy &&
    incident !== null &&
    incident.stage === "REPLACING" &&
    incident.replacement_transfer_id !== null;

  const canPayReplacement =
    !busy &&
    incident !== null &&
    incident.stage === "REPLACEMENT_SENT";

  const canResolve =
    !busy &&
    incident !== null &&
    incident.stage === "REPLACEMENT_SENT" &&
    incident.replacement_transfer_id !== null;

  async function callApi(
    url: string,
    options?: RequestInit
  ): Promise<ApiResult> {
    const response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options?.headers ?? {}),
      },
      cache: "no-store",
    });

    const data = (await response.json()) as ApiResult;

    if (!response.ok || !data.success) {
      throw new Error(
        data.error || "Cooyor request failed."
      );
    }

    return data;
  }

  async function loadLatestIncident() {
    try {
      const result = await callApi(
        "/api/cooyor/demo/sessions"
      );

      if (
        result.latest !== null &&
        result.latest !== undefined
      ) {
        setIncident(
          normalizeIncident(result.latest)
        );
      }
    } catch {
      // No active incident is normal on first load.
    }
  }

  async function refreshIncident(
    incidentId: string
  ) {
    const result = await callApi(
      `/api/cooyor/demo/status?incident_id=${encodeURIComponent(
        incidentId
      )}`
    );

    if (result.incident !== undefined) {
      setIncident(
        normalizeIncident(result.incident)
      );
    }
  }

  useEffect(() => {
    void loadLatestIncident();
  }, []);

  async function sendPayment() {
    setBusy(true);
    setError("");
    setMessage("Creating supplier payment...");

    try {
      const result = await callApi(
        "/api/cooyor/demo/start",
        {
          method: "POST",
        }
      );

      if (result.incident !== undefined) {
        setIncident(
          normalizeIncident(result.incident)
        );

        setMessage(
          "Payment created. Cooyor is now monitoring it."
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to create payment."
      );
    } finally {
      setBusy(false);
    }
  }

  async function transitionOriginal(
    nextStatus: "SENT" | "FAILED"
  ) {
    if (!incident) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      const result = await callApi(
        "/api/cooyor/demo/transition",
        {
          method: "POST",
          body: JSON.stringify({
            incident_id: incident.incident_id,
            next_status: nextStatus,
          }),
        }
      );

      if (result.incident !== undefined) {
        setIncident(
          normalizeIncident(result.incident)
        );
      }

      setMessage(
        nextStatus === "SENT"
          ? "Payment reached SENT. Cooyor continues monitoring."
          : "Bank return detected. Cooyor is analyzing the evidence."
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Transition failed."
      );
    } finally {
      setBusy(false);
    }
  }

  async function decide() {
    if (!incident) {
      return;
    }

    setBusy(true);
    setError("");
    setMessage(
      "Cooyor is analyzing payment evidence..."
    );

    try {
      const result = await callApi(
        "/api/cooyor/demo/decide",
        {
          method: "POST",
          body: JSON.stringify({
            incident_id: incident.incident_id,
          }),
        }
      );

      if (result.incident !== undefined) {
        const updated =
          normalizeIncident(result.incident);

        setIncident(updated);

        setMessage(
          updated.final_decision === "REPLACE"
            ? "Cooyor decided to replace the failed payment."
            : "Cooyor escalated the incident."
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Decision failed."
      );
    } finally {
      setBusy(false);
    }
  }

  async function createReplacement() {
    if (!incident) {
      return;
    }

    setBusy(true);
    setError("");
    setMessage(
      "Running safety checks before replacement..."
    );

    try {
      const result = await callApi(
        "/api/cooyor/demo/replace",
        {
          method: "POST",
          body: JSON.stringify({
            incident_id: incident.incident_id,
          }),
        }
      );

      if (result.incident !== undefined) {
        setIncident(
          normalizeIncident(result.incident)
        );
      }

      setMessage(
        "Safety gate passed. Protected replacement created."
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Replacement failed."
      );
    } finally {
      setBusy(false);
    }
  }

  async function transitionReplacement(
    nextStatus: "SENT" | "PAID"
  ) {
    if (!incident) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      const result = await callApi(
        "/api/cooyor/demo/replacement-transition",
        {
          method: "POST",
          body: JSON.stringify({
            incident_id: incident.incident_id,
            next_status: nextStatus,
          }),
        }
      );

      if (result.incident !== undefined) {
        setIncident(
          normalizeIncident(result.incident)
        );
      }

      setMessage(
        nextStatus === "SENT"
          ? "Replacement reached SENT. Cooyor is verifying delivery."
          : "Replacement is PAID. Incident can now be resolved."
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Replacement transition failed."
      );
    } finally {
      setBusy(false);
    }
  }

  async function resolveIncident() {
    if (!incident) {
      return;
    }

    setBusy(true);
    setError("");
    setMessage(
      "Verifying final payment outcomes..."
    );

    try {
      const result = await callApi(
        "/api/cooyor/demo/resolve",
        {
          method: "POST",
          body: JSON.stringify({
            incident_id: incident.incident_id,
          }),
        }
      );

      if (result.incident !== undefined) {
        setIncident(
          normalizeIncident(result.incident)
        );
      }

      setMessage(
        "Incident resolved. Original outcome preserved and replacement verified."
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to resolve incident."
      );
    } finally {
      setBusy(false);
    }
  }

  async function refresh() {
    if (!incident) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      await refreshIncident(
        incident.incident_id
      );

      setMessage(
        "Live payment status refreshed."
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to refresh status."
      );
    } finally {
      setBusy(false);
    }
  }

  function resetDemo() {
    setIncident(null);
    setError("");
    setMessage(
      "Ready to monitor a new supplier payment."
    );
  }

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#edf4f8] text-slate-950">

      {/* AMBIENT GLASS BACKGROUND */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-sky-300/25 blur-3xl" />

        <div className="absolute -right-40 top-20 h-[28rem] w-[28rem] rounded-full bg-blue-300/20 blur-3xl" />

        <div className="absolute bottom-0 left-1/3 h-80 w-80 rounded-full bg-indigo-300/15 blur-3xl" />

        <div className="absolute left-1/2 top-1/2 h-96 w-96 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/40 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-5 sm:px-6 lg:px-8">

        {/* HEADER */}
        <header className="mb-6 flex items-center justify-between rounded-[26px] border border-white/70 bg-white/55 px-4 py-3 shadow-[0_10px_40px_rgba(15,23,42,0.07)] backdrop-blur-2xl sm:px-5">

          <div className="flex items-center gap-3">

            <div className="flex h-11 w-11 items-center justify-center overflow-hidden rounded-2xl border border-white/80 bg-white/70 shadow-sm">
              <img
                src="/cooyor-logo.jpg"
                alt="Cooyor"
                className="h-full w-full object-cover"
              />
            </div>

            <div>
              <div className="text-xl font-bold tracking-tight text-slate-950">
                Cooyor
              </div>

              <div className="text-xs font-medium text-slate-500">
                Payment Operations
              </div>
            </div>

          </div>

          <div className="hidden items-center gap-2 text-xs font-semibold text-slate-500 sm:flex">
            <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.55)]" />
            Autonomous operations
          </div>

        </header>

        {/* HERO */}
        <section className="relative mb-6 overflow-hidden rounded-[30px] border border-white/20 bg-slate-950/90 p-6 text-white shadow-[0_25px_70px_rgba(15,23,42,0.18)] backdrop-blur-2xl sm:p-9">

          <div className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-sky-400/20 blur-3xl" />

          <div className="pointer-events-none absolute -bottom-32 left-1/3 h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />

          <div className="relative max-w-4xl">

            <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.18em] text-sky-200 backdrop-blur-xl">
              <span className="h-1.5 w-1.5 rounded-full bg-sky-300" />
              Autonomous Payment Operations
            </div>

            <h1 className="max-w-3xl text-3xl font-bold tracking-tight sm:text-5xl">
              Detect.
              <span className="text-sky-300">
                {" "}Decide.
              </span>
              {" "}Resolve.
            </h1>

            <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
              Cooyor monitors supplier payments, analyzes
              payment failures, prevents duplicate transfers,
              and executes the safest resolution automatically.
            </p>

            {/* FLOW */}
            <div className="mt-7 flex flex-wrap items-center gap-2 text-xs font-semibold">

              <FlowStep
                number="01"
                label="Detect"
                active={
                  incident === null ||
                  incident.stage === "CREATED" ||
                  incident.stage === "SENT"
                }
              />

              <div className="hidden h-px w-8 bg-white/20 sm:block" />

              <FlowStep
                number="02"
                label="Decide"
                active={
                  incident?.stage === "DECIDING" ||
                  incident?.stage === "REPLACING"
                }
              />

              <div className="hidden h-px w-8 bg-white/20 sm:block" />

              <FlowStep
                number="03"
                label="Resolve"
                active={
                  incident?.stage === "REPLACEMENT_SENT" ||
                  incident?.stage === "RESOLVED"
                }
              />

            </div>

            <div className="mt-7 flex flex-wrap gap-3">

              <button
                onClick={sendPayment}
                disabled={!canSend}
                className="rounded-2xl bg-white px-5 py-3.5 text-sm font-bold text-slate-950 shadow-lg transition hover:-translate-y-0.5 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Start supplier payment
              </button>

              {incident !== null && (
                <button
                  onClick={refresh}
                  disabled={busy}
                  className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3.5 text-sm font-semibold text-white backdrop-blur-xl transition hover:bg-white/10 disabled:opacity-40"
                >
                  Refresh status
                </button>
              )}

            </div>

          </div>
        </section>

        {/* COOYOR STATUS MESSAGE */}
        <div className="mb-6">

          <div className="rounded-[22px] border border-white/70 bg-white/55 px-4 py-3.5 text-sm text-slate-600 shadow-[0_8px_30px_rgba(15,23,42,0.05)] backdrop-blur-2xl">

            <div className="flex items-start gap-3">

              <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-slate-950 text-[11px] font-bold text-white shadow-sm">
                C
              </div>

              <div>
                <span className="font-bold text-slate-950">
                  Cooyor
                </span>{" "}
                {message}
              </div>

            </div>

          </div>

          {error && (
            <div className="mt-3 rounded-[22px] border border-red-200/70 bg-red-50/70 px-4 py-3.5 text-sm font-medium text-red-700 shadow-sm backdrop-blur-xl">
              {error}
            </div>
          )}

        </div>

        {/* MAIN GRID */}
        <div className="grid gap-6 lg:grid-cols-[1.05fr_.95fr]">

          {/* PAYMENT MONITOR */}
          <section className="rounded-[28px] border border-white/70 bg-white/55 p-5 shadow-[0_15px_50px_rgba(15,23,42,0.07)] backdrop-blur-2xl sm:p-6">

            <div className="mb-5 flex items-center justify-between">

              <div>
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                  Payment monitor
                </p>

                <h2 className="mt-1 text-xl font-bold tracking-tight">
                  Supplier payment
                </h2>
              </div>

              <div className="rounded-full border border-white/80 bg-white/60 px-3 py-1.5 text-xs font-bold text-slate-600 shadow-sm backdrop-blur-xl">
                {currentStatus}
              </div>

            </div>

            {incident === null ? (

              <div className="rounded-[24px] border border-dashed border-slate-300/70 bg-white/25 p-9 text-center backdrop-blur-xl">

                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border border-white/80 bg-white/60 text-xl font-bold text-slate-700 shadow-sm">
                  $
                </div>

                <p className="font-bold">
                  No active payment
                </p>

                <p className="mx-auto mt-2 max-w-xs text-sm leading-5 text-slate-500">
                  Start a supplier payment to activate
                  Cooyor monitoring.
                </p>

              </div>

            ) : (

              <div>

                {/* PAYMENT SUMMARY */}
                <div className="rounded-[24px] border border-white/70 bg-white/45 p-5 shadow-inner backdrop-blur-xl">

                  <div className="flex items-end justify-between gap-4">

                    <div>
                      <p className="text-sm text-slate-500">
                        Supplier
                      </p>

                      <p className="mt-1 text-lg font-bold">
                        {incident.supplier_name}
                      </p>
                    </div>

                    <div className="text-right">

                      <p className="text-3xl font-bold tracking-tight">
                        ${incident.amount.toFixed(2)}
                      </p>

                      <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        {incident.currency}
                      </p>

                    </div>

                  </div>

                  <div className="mt-5 grid gap-3 sm:grid-cols-2">

                    <Info
                      label="Incident"
                      value={incident.incident_id}
                    />

                    <Info
                      label="Original payment"
                      value={
                        incident.original_transfer_id
                      }
                    />

                  </div>

                </div>

                {/* PAYMENT STATE */}
                <div className="mt-6">

                  <div className="mb-3 flex items-center justify-between">

                    <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                      Payment state
                    </p>

                    <span className="text-[11px] font-semibold text-slate-400">
                      Live workflow
                    </span>

                  </div>

                  <div className="flex flex-wrap gap-2">

                    {(
                      [
                        "CREATED",
                        "SENT",
                        "FAILED",
                        "REPLACING",
                        "REPLACEMENT_SENT",
                        "RESOLVED",
                      ] as Stage[]
                    ).map((stage) => {

                      const active =
                        incident.stage === stage;

                      return (
                        <div
                          key={stage}
                          className={`rounded-full border px-3 py-1.5 text-xs font-bold transition ${
                            active
                              ? "border-slate-950 bg-slate-950 text-white shadow-sm"
                              : "border-white/70 bg-white/45 text-slate-400"
                          }`}
                        >
                          {statusLabel(stage)}
                        </div>
                      );
                    })}

                  </div>

                </div>

                {/* FAILURE EVIDENCE */}
                {incident.failure_reason !== null && (

                  <div className="mt-6 rounded-[22px] border border-amber-200/70 bg-amber-50/65 p-4 backdrop-blur-xl">

                    <div className="flex items-center gap-2">

                      <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-amber-100 text-xs font-bold text-amber-700">
                        !
                      </span>

                      <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-amber-700">
                        Failure evidence
                      </p>

                    </div>

                    <p className="mt-3 text-sm font-semibold text-amber-950">
                      {incident.failure_reason}
                    </p>

                    {incident.failure_type !== null && (
                      <p className="mt-1 text-xs font-medium text-amber-700">
                        Classification:{" "}
                        {incident.failure_type}
                      </p>
                    )}

                  </div>

                )}

              </div>

            )}

          </section>

          {/* INCIDENT COMMANDER */}
          <section className="rounded-[28px] border border-white/70 bg-white/55 p-5 shadow-[0_15px_50px_rgba(15,23,42,0.07)] backdrop-blur-2xl sm:p-6">

            <div className="mb-5">

              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                Incident commander
              </p>

              <h2 className="mt-1 text-xl font-bold tracking-tight">
                Cooyor decision engine
              </h2>

            </div>

            {incident === null ? (

              <div className="rounded-[24px] border border-white/70 bg-white/35 p-6 text-sm leading-6 text-slate-500 backdrop-blur-xl">
                Cooyor will analyze payment evidence
                when an incident occurs.
              </div>

            ) : (

              <div className="space-y-3">

                <DecisionRow
                  label="Initial plan"
                  value={
                    incident.initial_decision ??
                    "WAIT"
                  }
                />

                <DecisionRow
                  label="New evidence"
                  value={
                    incident.failure_type ??
                    "Waiting for payment outcome"
                  }
                />

                <DecisionRow
                  label="Revised decision"
                  value={
                    incident.final_decision ??
                    "PENDING"
                  }
                  strong
                />

                {/* SAFETY GATE */}
                <div className="mt-5 rounded-[24px] border border-white/80 bg-white/35 p-4 backdrop-blur-xl">

                  <div className="flex items-center justify-between">

                    <p className="text-[11px] font-bold uppercase tracking-[0.15em] text-slate-400">
                      Safety gate
                    </p>

                    <span className="rounded-full bg-slate-100/80 px-2.5 py-1 text-[10px] font-bold text-slate-500">
                      Protected
                    </span>

                  </div>

                  <div className="mt-4 space-y-3">

                    <Gate
                      label="Original payment is final"
                      passed={
                        incident.stage ===
                          "REPLACING" ||
                        incident.stage ===
                          "REPLACEMENT_SENT" ||
                        incident.stage ===
                          "RESOLVED"
                      }
                    />

                    <Gate
                      label="Replacement decision authorized"
                      passed={
                        incident.final_decision ===
                        "REPLACE"
                      }
                    />

                    <Gate
                      label="Duplicate lock acquired"
                      passed={
                        incident.duplicate_lock_acquired
                      }
                    />

                    <Gate
                      label="Replacement paid"
                      passed={incident.resolved}
                    />

                  </div>

                </div>

                {/* ACTIONS */}
                <div className="pt-3">

                  {canSendToBank && (
                    <ActionButton
                      onClick={() =>
                        transitionOriginal(
                          "SENT"
                        )
                      }
                      disabled={busy}
                    >
                      Advance payment to SENT
                    </ActionButton>
                  )}

                  {canDetectReturn && (
                    <ActionButton
                      onClick={() =>
                        transitionOriginal(
                          "FAILED"
                        )
                      }
                      disabled={busy}
                    >
                      Simulate bank return
                    </ActionButton>
                  )}

                  {canDecide && (
                    <ActionButton
                      onClick={decide}
                      disabled={busy}
                    >
                      Analyze & decide
                    </ActionButton>
                  )}

                  {canReplace && (
                    <ActionButton
                      onClick={createReplacement}
                      disabled={busy}
                    >
                      Execute protected replacement
                    </ActionButton>
                  )}

                  {canSendReplacement && (
                    <ActionButton
                      onClick={() =>
                        transitionReplacement(
                          "SENT"
                        )
                      }
                      disabled={busy}
                    >
                      Advance replacement to SENT
                    </ActionButton>
                  )}

                  {canPayReplacement && (
                    <ActionButton
                      onClick={() =>
                        transitionReplacement(
                          "PAID"
                        )
                      }
                      disabled={busy}
                    >
                      Advance replacement to PAID
                    </ActionButton>
                  )}

                  {canResolve && (
                    <ActionButton
                      onClick={resolveIncident}
                      disabled={busy}
                    >
                      Resolve incident
                    </ActionButton>
                  )}

                  {incident.resolved && (

                    <div className="rounded-[22px] border border-emerald-200/70 bg-emerald-50/65 p-4 text-center backdrop-blur-xl">

                      <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
                        ✓
                      </div>

                      <div className="mt-2 text-sm font-bold text-emerald-700">
                        Incident resolved
                      </div>

                      <div className="mt-1 text-xs leading-5 text-emerald-600">
                        Original payment preserved as
                        CANCELLED. Replacement verified
                        as PAID.
                      </div>

                    </div>

                  )}

                </div>

              </div>

            )}

          </section>

        </div>

        {/* AGENT ACTIVITY */}
        <section className="mt-6 rounded-[28px] border border-white/70 bg-white/55 p-5 shadow-[0_15px_50px_rgba(15,23,42,0.07)] backdrop-blur-2xl sm:p-6">

          <div className="mb-6 flex items-center justify-between">

            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-400">
                Agent activity
              </p>

              <h2 className="mt-1 text-xl font-bold tracking-tight">
                Decision timeline
              </h2>
            </div>

            {incident !== null && (
              <span className="rounded-full border border-white/70 bg-white/50 px-3 py-1.5 text-[11px] font-semibold text-slate-400 backdrop-blur-xl">
                {incident.events.length} events
              </span>
            )}

          </div>

          {incident === null ||
          incident.events.length === 0 ? (

            <div className="rounded-[24px] border border-white/70 bg-white/30 p-8 text-center text-sm text-slate-500 backdrop-blur-xl">
              Activity will appear here as Cooyor
              operates the payment.
            </div>

          ) : (

            <div className="relative">

              <div className="absolute bottom-2 left-[11px] top-2 w-px bg-slate-200/80" />

              <div className="space-y-5">

                {incident.events.map((event) => (

                  <div
                    key={event.id}
                    className="relative flex gap-4"
                  >

                    <div className="relative z-10 mt-1 flex h-[23px] w-[23px] shrink-0 items-center justify-center rounded-full border-4 border-white/80 bg-slate-950 shadow-sm">
                      <span className="h-1.5 w-1.5 rounded-full bg-white" />
                    </div>

                    <div className="min-w-0 flex-1 rounded-[20px] border border-white/60 bg-white/30 px-4 py-3 backdrop-blur-xl">

                      <div className="flex flex-wrap items-center justify-between gap-2">

                        <p className="text-sm font-bold">
                          {formatEventType(event.type)}
                        </p>

                        <time className="text-[11px] font-medium text-slate-400">
                          {formatTime(
                            event.created_at
                          )}
                        </time>

                      </div>

                      <p className="mt-1 text-sm leading-5 text-slate-500">
                        {event.message}
                      </p>

                    </div>

                  </div>

                ))}

              </div>

            </div>

          )}

        </section>

        {/* FOOTER */}
        <footer className="mt-6 flex flex-col gap-3 border-t border-white/60 pt-5 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">

          <span className="font-medium">
            Cooyor — Autonomous Payment Operations Agent
          </span>

          <span className="text-slate-400">
            Detect. Decide. Resolve.
          </span>

        </footer>

        {incident !== null && (

          <div className="mt-4 flex justify-end">

            <button
              onClick={resetDemo}
              disabled={busy}
              className="rounded-full border border-white/70 bg-white/40 px-4 py-2 text-xs font-semibold text-slate-400 shadow-sm backdrop-blur-xl transition hover:bg-white/70 hover:text-slate-700 disabled:opacity-40"
            >
              Start a new demo
            </button>

          </div>

        )}

      </div>
    </main>
  );
}

/* ----------------------------- */
/* UI COMPONENTS */
/* ----------------------------- */

function FlowStep({
  number,
  label,
  active,
}: {
  number: string;
  label: string;
  active: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-full border px-3 py-1.5 backdrop-blur-xl ${
        active
          ? "border-white/20 bg-white/10 text-white"
          : "border-white/10 bg-white/5 text-slate-500"
      }`}
    >
      <span className="text-[10px] opacity-60">
        {number}
      </span>

      <span>{label}</span>
    </div>
  );
}

function Info({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-white/50 bg-white/25 p-3">

      <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
        {label}
      </p>

      <p className="mt-1 truncate text-xs font-semibold text-slate-700">
        {value}
      </p>

    </div>
  );
}

function DecisionRow({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-[18px] border border-white/60 bg-white/35 px-4 py-3 backdrop-blur-xl">

      <span className="text-sm text-slate-500">
        {label}
      </span>

      <span
        className={`max-w-[58%] truncate text-right text-sm ${
          strong
            ? "font-bold text-slate-950"
            : "font-semibold text-slate-700"
        }`}
      >
        {value}
      </span>

    </div>
  );
}

function Gate({
  label,
  passed,
}: {
  label: string;
  passed: boolean;
}) {
  return (
    <div className="flex items-center gap-3">

      <span
        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
          passed
            ? "bg-emerald-100 text-emerald-700"
            : "bg-slate-100/80 text-slate-400"
        }`}
      >
        {passed ? "✓" : "•"}
      </span>

      <span
        className={
          passed
            ? "text-sm font-medium text-slate-700"
            : "text-sm text-slate-400"
        }
      >
        {label}
      </span>

    </div>
  );
}

function ActionButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full rounded-[18px] border border-slate-950 bg-slate-950 px-4 py-3.5 text-sm font-bold text-white shadow-lg shadow-slate-950/10 transition hover:-translate-y-0.5 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
    >
      {disabled ? "Processing..." : children}
    </button>
  );
}