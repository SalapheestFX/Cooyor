export type IncidentRecord = {
  incident_id: string;
  original_transfer_id: string;
  replacement_transfer_id: string;
  decision: "REPLACE";
  failure_type: string;
  failure_reason: string;
  original_status: string;
  replacement_status: string;
  amount: number;
  currency: string;
  resolved: boolean;
  resolved_at: string | null;
};

const records = new Map<string, IncidentRecord>();

export function saveIncidentRecord(record: IncidentRecord) {
  records.set(record.incident_id, record);
  return record;
}

export function getIncidentRecord(incidentId: string) {
  return records.get(incidentId) ?? null;
}

export function listIncidentRecords() {
  return Array.from(records.values());
}