export const MAX_BYTES = 1024 * 1024;
export const MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "application/pdf",
] as const;
export interface CloudRule {
  id: string;
  name: string;
  literal: string;
  enabled: boolean;
  action: "warn" | "block";
}
export interface Policy {
  version: number;
  rules: CloudRule[];
}
export interface Evidence {
  uploadId: string;
  messageIndex: number | "draft";
}
export interface CheckRequest {
  id: string;
  text: string;
  context: string[];
  evidence: Evidence[];
}
export interface Assessment {
  status: "allowed" | "warning" | "blocked" | "unavailable";
  reason:
    | "CLEAR"
    | "RESTRICTED_LITERAL"
    | "RESTRICTED_ATTACHMENT"
    | "CREDENTIAL_REQUEST"
    | "SOCIAL_ENGINEERING"
    | "ANALYSIS_UNAVAILABLE";
  severity: "none" | "caution" | "high" | "critical";
  risk: number | null;
  source: "server-policy" | "bedrock" | "unavailable";
  explanation: string;
}
export interface CloudIncident {
  id: string;
  time: string;
  reason: Assessment["reason"];
  severity: Assessment["severity"];
  risk: number | null;
  source: Assessment["source"];
  policyVersion: number;
  disposition: "open" | "acknowledged" | "escalated";
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Expected object");
  return value as Record<string, unknown>;
}
export function exact(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).some((k) => !keys.includes(k)))
    throw Error("Unknown field");
}
export function string(value: unknown, max: number): string {
  if (typeof value !== "string" || value.length > max)
    throw Error("Invalid string");
  return value;
}
export function id(value: unknown): string {
  const result = string(value, 80);
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(result)) throw Error("Invalid identifier");
  return result;
}
export function rules(value: unknown): CloudRule[] {
  if (!Array.isArray(value) || value.length > 50) throw Error("Invalid rules");
  const result = value.map((raw) => {
    const r = object(raw);
    exact(r, ["id", "name", "literal", "enabled", "action"]);
    if (
      typeof r.enabled !== "boolean" ||
      !["warn", "block"].includes(String(r.action))
    )
      throw Error("Invalid rule");
    const literal = string(r.literal, 120).trim();
    if (!literal) throw Error("Empty literal");
    return {
      id: id(r.id),
      name: string(r.name, 120),
      literal,
      enabled: r.enabled,
      action: r.action as CloudRule["action"],
    };
  });
  if (
    new Set(result.map((r) => r.id)).size !== result.length ||
    new Set(result.map((r) => r.literal.toLowerCase())).size !== result.length
  )
    throw Error("Duplicate rules");
  return result;
}
export function check(value: unknown): CheckRequest {
  const r = object(value);
  exact(r, ["id", "text", "context", "evidence"]);
  if (
    !Array.isArray(r.context) ||
    r.context.length > 20 ||
    !Array.isArray(r.evidence) ||
    r.evidence.length > 4
  )
    throw Error("Invalid context");
  const context = r.context.map((v) => string(v, 2000));
  if (context.join("").length > 16000) throw Error("Context too large");
  const evidence = r.evidence.map((v) => {
    const e = object(v);
    exact(e, ["uploadId", "messageIndex"]);
    if (
      e.messageIndex !== "draft" &&
      (!Number.isInteger(e.messageIndex) ||
        Number(e.messageIndex) < 0 ||
        Number(e.messageIndex) >= context.length)
    )
      throw Error("Invalid provenance");
    return {
      uploadId: id(e.uploadId),
      messageIndex: e.messageIndex as number | "draft",
    };
  });
  if (new Set(evidence.map((e) => e.uploadId)).size !== evidence.length)
    throw Error("Duplicate evidence");
  return { id: id(r.id), text: string(r.text, 2000), context, evidence };
}
export function assessment(value: unknown): Assessment {
  const r = object(value);
  exact(r, ["status", "reason", "severity", "risk", "source", "explanation"]);
  if (
    !["allowed", "warning", "blocked", "unavailable"].includes(
      String(r.status),
    ) ||
    ![
      "CLEAR",
      "RESTRICTED_LITERAL",
      "RESTRICTED_ATTACHMENT",
      "CREDENTIAL_REQUEST",
      "SOCIAL_ENGINEERING",
      "ANALYSIS_UNAVAILABLE",
    ].includes(String(r.reason)) ||
    !["none", "caution", "high", "critical"].includes(String(r.severity)) ||
    !["server-policy", "bedrock", "unavailable"].includes(String(r.source)) ||
    (r.risk !== null &&
      (!Number.isFinite(r.risk) || Number(r.risk) < 0 || Number(r.risk) > 100))
  )
    throw Error("Invalid assessment");
  string(r.explanation, 1000);
  return r as unknown as Assessment;
}
