import {
  initialRules,
  attachments,
  scenarios,
  type Incident,
  type PolicyRevision,
  type Rule,
  type Scenario,
} from "./policy";
export const STORAGE_KEY = "threatlock:v3";
export interface Message {
  text: string;
  outgoing: boolean;
  attachmentId?: string;
}
export interface Session {
  scenario: string;
  draft: string;
  attachmentId: string;
  messages: Message[];
  incomingStep: number;
  assessmentRevision: number;
  incidents: Incident[];
  policy: PolicyRevision;
  previousPolicy?: PolicyRevision;
  draftRules: Rule[];
}
export function scenarioStart(scenario: Scenario) {
  return {
    scenario: scenario.id,
    draft: scenario.draft,
    attachmentId: scenario.attachmentId || "",
    incomingStep: 1,
    messages: scenario.incoming.slice(0, 1).map((text) => ({
      text,
      outgoing: false,
      ...(scenario.incomingAttachmentId
        ? { attachmentId: scenario.incomingAttachmentId }
        : {}),
    })),
  };
}
export function fresh(): Session {
  const rules = initialRules.map((rule) => ({ ...rule }));
  return {
    ...scenarioStart(scenarios[1]),
    assessmentRevision: 0,
    incidents: [],
    policy: { version: 1, publishedAt: new Date().toISOString(), rules },
    draftRules: rules.map((rule) => ({ ...rule })),
  };
}
export function read(): Session {
  try {
    const data = JSON.parse(
      sessionStorage.getItem(STORAGE_KEY) || "null",
    ) as Session | null;
    return data &&
      Array.isArray(data.messages) &&
      Array.isArray(data.incidents) &&
      Array.isArray(data.policy?.rules) &&
      Array.isArray(data.draftRules) &&
      scenarios.some((s) => s.id === data.scenario)
      ? data
      : fresh();
  } catch {
    return fresh();
  }
}
export function appendIncident(
  incidents: Incident[],
  incident: Incident,
): Incident[] {
  return incidents.some((existing) => existing.id === incident.id)
    ? incidents
    : [incident, ...incidents];
}
export function matchesIncomingContext(
  scenario: Scenario,
  messages: Message[],
): boolean {
  return (
    !messages.some((message) => message.outgoing) &&
    JSON.stringify(messages.map((message) => message.text)) ===
      JSON.stringify(scenario.incoming) &&
    JSON.stringify(
      messages.flatMap((message) =>
        message.attachmentId ? [message.attachmentId] : [],
      ),
    ) ===
      JSON.stringify(
        scenario.incomingAttachmentId ? [scenario.incomingAttachmentId] : [],
      )
  );
}
export function incomingSignal(
  scenario: Scenario,
  messages: Message[],
): Incident | undefined {
  const result = scenario.incomingAssessment;
  if (!result || !matchesIncomingContext(scenario, messages)) return;
  return {
    id: `incoming-${scenario.id}`,
    time: new Date().toISOString(),
    reason: result.reason,
    severity: result.severity,
    risk: { none: 0, caution: 45, high: 80, critical: 95 }[result.severity],
    source: "recorded-fixture",
    disposition: "open",
    direction: "incoming",
    ...(scenario.incomingAttachmentId
      ? {
          attachmentKind: attachments.find(
            (attachment) => attachment.id === scenario.incomingAttachmentId,
          )?.kind,
        }
      : {}),
    personaId: "jamie",
  };
}
export function publishRevision(
  current: PolicyRevision,
  rules: Rule[],
  restoredFrom?: number,
): PolicyRevision {
  return {
    version: current.version + 1,
    publishedAt: new Date().toISOString(),
    rules: rules.map((rule) => ({ ...rule })),
    ...(restoredFrom === undefined ? {} : { restoredFrom }),
  };
}
