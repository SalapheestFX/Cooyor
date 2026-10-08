export type IncidentStage =
  | "CREATED"
  | "SENT"
  | "FAILED"
  | "DECIDING"
  | "REPLACING"
  | "REPLACEMENT_SENT"
  | "RESOLVED";

export type IncidentEvent = {
  id: string;
  type: string;
  message: string;
  created_at: string;
};

export type IncidentSession = {
  incident_id: string;

  original_transfer_id: string;
  original_reference: string;

  replacement_transfer_id: string | null;
  replacement_reference: string | null;

  amount: number;
  currency: string;

  supplier_name: string;

  stage: IncidentStage;

  initial_decision: "WAIT" | null;
  final_decision: "REPLACE" | "ESCALATE" | null;

  failure_type: string | null;
  failure_reason: string | null;

  duplicate_lock_acquired: boolean;

  resolved: boolean;
  resolved_at: string | null;

  events: IncidentEvent[];

  created_at: string;
};

const sessions = new Map<string, IncidentSession>();

export function createIncidentSession(input: {
  original_transfer_id: string;
  original_reference: string;
  amount: number;
  currency: string;
  supplier_name: string;
}) {
  const incident_id = `INC-${input.original_transfer_id}`;

  const session: IncidentSession = {
    incident_id,

    original_transfer_id: input.original_transfer_id,
    original_reference: input.original_reference,

    replacement_transfer_id: null,
    replacement_reference: null,

    amount: input.amount,
    currency: input.currency,

    supplier_name: input.supplier_name,

    stage: "CREATED",

    initial_decision: null,
    final_decision: null,

    failure_type: null,
    failure_reason: null,

    duplicate_lock_acquired: false,

    resolved: false,
    resolved_at: null,

    events: [],

    created_at: new Date().toISOString(),
  };

  sessions.set(incident_id, session);

  addIncidentEvent(
    incident_id,
    "PAYMENT_CREATED",
    `Supplier payment created for ${input.supplier_name}.`
  );

  return session;
}

export function getIncidentSession(incidentId: string) {
  return sessions.get(incidentId) ?? null;
}

export function listIncidentSessions() {
  return Array.from(sessions.values());
}

export function updateIncidentSession(
  incidentId: string,
  updates: Partial<IncidentSession>
) {
  const session = sessions.get(incidentId);

  if (!session) {
    return null;
  }

  const updated = {
    ...session,
    ...updates,
  };

  sessions.set(incidentId, updated);

  return updated;
}

export function addIncidentEvent(
  incidentId: string,
  type: string,
  message: string
) {
  const session = sessions.get(incidentId);

  if (!session) {
    return null;
  }

  const event: IncidentEvent = {
    id: crypto.randomUUID(),
    type,
    message,
    created_at: new Date().toISOString(),
  };

  session.events.push(event);

  sessions.set(incidentId, session);

  return event;
}