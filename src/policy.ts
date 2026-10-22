export type Severity = "none" | "caution" | "high" | "critical";
export type Status =
  | "editing"
  | "checking"
  | "allowed"
  | "warning"
  | "blocked"
  | "unavailable"
  | "sent";
export type ReasonCode =
  | "CLEAR"
  | "RESTRICTED_LITERAL"
  | "RESTRICTED_ATTACHMENT"
  | "CREDENTIAL_REQUEST"
  | "SOCIAL_ENGINEERING"
  | "POSSIBLE_FALSE_POSITIVE"
  | "ANALYSIS_UNAVAILABLE"
  | "MANUAL_ESCALATION";
export interface Rule {
  id: string;
  name: string;
  literal: string;
  enabled: boolean;
  action: "warn" | "block";
}
export interface PolicyRevision {
  version: number;
  publishedAt: string;
  rules: Rule[];
  restoredFrom?: number;
}
export interface Attachment {
  id: string;
  name: string;
  kind: "document" | "image";
  classification: "public" | "restricted";
  description: string;
  path: string;
}
export interface Analysis {
  status: Status;
  severity: Severity;
  risk: number | null;
  reason: ReasonCode;
  explanation: string;
  source: "local-policy" | "recorded-fixture" | "unavailable";
}
export interface AnalysisRequest {
  text: string;
  attachment?: Attachment;
  fixtureId?: string;
  context?: string[];
  incomingAttachmentIds?: string[];
}
export interface AnalysisAdapter {
  analyze(request: AnalysisRequest, rules: Rule[]): Promise<Analysis>;
}
export interface Incident {
  id: string;
  time: string;
  reason: ReasonCode;
  severity: Severity;
  risk: number | null;
  source: Analysis["source"] | "synthetic-history";
  attachmentKind?: Attachment["kind"];
  disposition: "open" | "acknowledged" | "escalated";
  direction: "incoming" | "outgoing" | "manual";
  personaId: string;
}
export const initialRules: Rule[] = [
  {
    id: "r1",
    name: "Secret demo token",
    literal: "DEMO-SECRET-7842",
    enabled: true,
    action: "block",
  },
  {
    id: "r2",
    name: "Restricted project",
    literal: "PROJECT NIGHTFALL",
    enabled: true,
    action: "block",
  },
];
export const attachments: Attachment[] = [
  {
    id: "brief",
    path: "/samples/brief.pdf",
    name: "Community event brief.pdf",
    kind: "document",
    classification: "public",
    description: "Fictional public event agenda; no personal information.",
  },
  {
    id: "restricted",
    path: "/samples/restricted.pdf",
    name: "Nightfall roadmap.pdf",
    kind: "document",
    classification: "restricted",
    description:
      "Fictional document labeled RESTRICTED. Local classification blocks sharing.",
  },
  {
    id: "public-image",
    path: "/samples/public-image.jpg",
    name: "Community poster.jpg",
    kind: "image",
    classification: "public",
    description: "fictional public community poster.",
  },
  {
    id: "restricted-image",
    path: "/samples/restricted-image.png",
    name: "Restricted whiteboard.png",
    kind: "image",
    classification: "restricted",
    description: "fictional whiteboard labeled RESTRICTED.",
  },
  {
    id: "secret-note",
    path: "/samples/secret-note.pdf",
    name: "Secret sample.pdf",
    kind: "document",
    classification: "restricted",
    description: "synthetic secret sample.",
  },
  {
    id: "screen",
    path: "/samples/screen.png",
    name: "Account recovery screenshot.png",
    kind: "image",
    classification: "public",
    description:
      "Fictional screenshot requesting an account recovery code. Recorded contextual warning.",
  },
];
export interface Scenario {
  id: string;
  name: string;
  category: string;
  incoming: string[];
  draft: string;
  attachmentId?: string;
  incomingAttachmentId?: string;
  analysis?: { severity: Severity; reason: ReasonCode; explanation: string };
  incomingAssessment?: {
    severity: Severity;
    reason: ReasonCode;
    explanation: string;
  };
  outage?: boolean;
}
export const scenarios: Scenario[] = [
  {
    id: "benign",
    name: "Everyday collaboration",
    category: "Safe conversation",
    incoming: ["Hey! Is the community meetup still happening on Friday?"],
    draft: "Yes! The public agenda is ready. See you Friday.",
  },
  {
    id: "social",
    incomingAssessment: {
      severity: "high",
      reason: "SOCIAL_ENGINEERING",
      explanation:
        "A sender claims a trusted connection, creates urgency, and requests internal information through a personal channel.",
    },
    name: "A little too familiar",
    category: "Social engineering",
    incoming: [
      "Hi, I’m helping Maya with the launch. She said you could help.",
      "We’re in a rush. Could you send the internal launch notes to my personal email?",
    ],
    draft: "Sure, I can send the internal launch notes to your personal email.",
    analysis: {
      severity: "high",
      reason: "SOCIAL_ENGINEERING",
      explanation:
        "The conversation combines claimed authority, urgency, and a request to move internal information to a personal channel.",
    },
  },
  {
    id: "credential",
    incomingAssessment: {
      severity: "critical",
      reason: "CREDENTIAL_REQUEST",
      explanation:
        "The sender claims to be IT support and demands a recovery code under threat of account lockout.",
    },
    name: "The urgent IT request",
    category: "Credential solicitation",
    incoming: [
      "IT support here. Your account will be locked in 10 minutes.",
      "Send your recovery code here so I can keep you signed in.",
    ],
    draft: "My recovery code is 482019.",
    analysis: {
      severity: "critical",
      reason: "CREDENTIAL_REQUEST",
      explanation:
        "The sender asks for a recovery code under time pressure. Verify the request through your established support channel.",
    },
  },
  {
    id: "restricted",
    name: "The confidential handoff",
    category: "Restricted attachment",
    incoming: ["Can you share the Nightfall roadmap here?"],
    draft: "Here is the roadmap you asked for.",
    attachmentId: "restricted",
  },
  {
    id: "screenshot",
    incomingAssessment: {
      severity: "high",
      reason: "CREDENTIAL_REQUEST",
      explanation:
        "The incoming request and curated screenshot ask the recipient to disclose an account recovery code.",
    },
    name: "A screenshot tells a story",
    category: "Image context",
    incoming: [
      "Follow the instructions in this screenshot and send me the code.",
    ],
    draft: "I’ll follow these account recovery instructions.",
    incomingAttachmentId: "screen",
    analysis: {
      severity: "high",
      reason: "CREDENTIAL_REQUEST",
      explanation:
        "This curated screenshot fixture depicts a request for an account recovery code. Treat this as a credential-sharing warning.",
    },
  },
  {
    id: "falsepositive",
    name: "A harmless turn of phrase",
    category: "Overridable warning",
    incoming: ["Did the rehearsal go well?"],
    draft: "Yes, we absolutely killed it at the rehearsal!",
    analysis: {
      severity: "caution",
      reason: "POSSIBLE_FALSE_POSITIVE",
      explanation:
        "This phrase can sound threatening without context. In this rehearsal conversation it is likely an idiom; use your judgment.",
    },
  },
  {
    id: "manual",
    name: "Trust your instincts",
    category: "Manual escalation",
    incoming: [
      "Please keep this request between us. Can we talk somewhere else?",
    ],
    draft: "I’d like our security team to review this request first.",
  },
  {
    id: "outage",
    name: "When analysis is unavailable",
    category: "Service outage",
    incoming: ["Can you send the public event details?"],
    draft: "The event starts at 10 AM on Friday.",
    outage: true,
  },
];
export function validateLiteral(
  literal: string,
  rules: Rule[],
): string | undefined {
  if (!literal.trim()) return "Enter a literal phrase.";
  if (literal.length > 120) return "Use 120 characters or fewer.";
  if (rules.length >= 50) return "A maximum of 50 rules is supported.";
  if (
    rules.some((r) => r.literal.toLowerCase() === literal.trim().toLowerCase())
  )
    return "That phrase already has a rule.";
}
export function evaluateLocal(
  request: AnalysisRequest,
  rules: Rule[],
): Analysis | undefined {
  if (request.attachment?.classification === "restricted")
    return {
      status: "blocked",
      severity: "critical",
      risk: 100,
      reason: "RESTRICTED_ATTACHMENT",
      source: "local-policy",
      explanation:
        "This fictional attachment is classified as restricted. Sharing is blocked by deterministic policy.",
    };
  if (
    /TL-DEMO-SECRET-[A-Z0-9-]+|\bTHREATLOCK DEMO: RESTRICTED\b/i.test(
      request.text,
    )
  )
    return {
      status: "blocked",
      severity: "critical",
      risk: 100,
      reason: "RESTRICTED_LITERAL",
      source: "local-policy",
      explanation:
        "A built-in restricted marker or synthetic secret format was detected. Remove it before sending.",
    };
  const matching = rules.filter(
    (r) =>
      r.enabled && request.text.toLowerCase().includes(r.literal.toLowerCase()),
  );
  if (matching.length) {
    const block = matching.some((r) => r.action === "block");
    return {
      status: block ? "blocked" : "warning",
      severity: block ? "critical" : "caution",
      risk: block ? 100 : 45,
      reason: "RESTRICTED_LITERAL",
      source: "local-policy",
      explanation: block
        ? "Your draft contains an enabled block phrase. Remove it before sending."
        : "Your draft contains an enabled warning phrase. Review before sending.",
    };
  }
}
export const localAdapter: AnalysisAdapter = {
  async analyze(request, rules) {
    const block = evaluateLocal(request, rules);
    if (block) return block;
    const fixture = scenarios.find(
      (s) =>
        s.id === request.fixtureId &&
        s.draft === request.text &&
        s.attachmentId === request.attachment?.id &&
        JSON.stringify(s.incoming) === JSON.stringify(request.context) &&
        JSON.stringify(
          s.incomingAttachmentId ? [s.incomingAttachmentId] : [],
        ) === JSON.stringify(request.incomingAttachmentIds ?? []),
    );
    if (fixture?.outage || !fixture)
      return {
        status: "unavailable",
        severity: "none",
        risk: null,
        reason: "ANALYSIS_UNAVAILABLE",
        source: "unavailable",
        explanation: fixture?.outage
          ? "Simulated analysis outage. Local policy passed; contextual analysis is unavailable."
          : "Local policy passed. Live AI is not connected; no recorded contextual result matches this draft, attachment, and conversation.",
      };
    if (fixture.analysis) {
      const a = fixture.analysis;
      return {
        ...a,
        status: "warning",
        risk: { none: 0, caution: 45, high: 80, critical: 95 }[a.severity],
        source: "recorded-fixture",
      };
    }
    return {
      status: "allowed",
      severity: "none",
      risk: 0,
      reason: "CLEAR",
      source: "recorded-fixture",
      explanation:
        "Local policy passed. This exact curated fixture has a recorded safe result.",
    };
  },
};
export function cloudContext(messages: string[]): string[] {
  const result: string[] = [];
  let size = 0;
  for (const message of messages.slice(-20).reverse()) {
    if (size + message.length > 16000) break;
    result.unshift(message);
    size += message.length;
  }
  return result;
}
