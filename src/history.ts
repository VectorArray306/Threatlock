import type { Incident, ReasonCode, Severity } from "./policy";
export const personas = [
  { id: "jamie", name: "Jamie Davis", role: "Security analyst" },
  { id: "alex", name: "Alex Chen", role: "Product designer" },
  { id: "priya", name: "Priya Rao", role: "Operations lead" },
];
const samples: [string, number, Severity, ReasonCode, Incident["direction"]][] =
  [
    ["jamie", 8, "caution", "POSSIBLE_FALSE_POSITIVE", "outgoing"],
    ["jamie", 10, "high", "SOCIAL_ENGINEERING", "incoming"],
    ["jamie", 13, "critical", "RESTRICTED_ATTACHMENT", "outgoing"],
    ["jamie", 16, "high", "MANUAL_ESCALATION", "manual"],
    ["alex", 9, "none", "CLEAR", "outgoing"],
    ["alex", 11, "critical", "CREDENTIAL_REQUEST", "incoming"],
    ["alex", 14, "caution", "POSSIBLE_FALSE_POSITIVE", "outgoing"],
    ["alex", 17, "critical", "RESTRICTED_LITERAL", "outgoing"],
    ["priya", 8, "high", "SOCIAL_ENGINEERING", "incoming"],
    ["priya", 12, "none", "CLEAR", "outgoing"],
    ["priya", 15, "high", "MANUAL_ESCALATION", "manual"],
    ["priya", 18, "critical", "CREDENTIAL_REQUEST", "incoming"],
  ];
export const syntheticHistory: Incident[] = samples.map(
  ([personaId, hour, severity, reason, direction], index) => ({
    id: `synthetic-${index}`,
    time: new Date(2026, 9, 18, hour, 15).toISOString(),
    personaId,
    severity,
    reason,
    direction,
    risk:
      reason === "RESTRICTED_ATTACHMENT" || reason === "RESTRICTED_LITERAL"
        ? 100
        : { none: 0, caution: 45, high: 80, critical: 95 }[severity],
    source: "synthetic-history",
    disposition: index % 3 === 0 ? "escalated" : "acknowledged",
  }),
);
export const severityColors: Record<Severity, string> = {
  none: "#62866f",
  caution: "#a88631",
  high: "#bd713c",
  critical: "#b35148",
};
