import { createHash, randomUUID } from "node:crypto";
import {
  assessment,
  check,
  exact,
  id,
  MAX_BYTES,
  MIME_TYPES,
  object,
  rules,
  string,
  type Assessment,
  type CloudIncident,
  type Policy,
} from "../src/cloud-contract";
export interface Ports {
  get(key: string): Promise<Record<string, unknown> | undefined>;
  put(
    key: string,
    value: Record<string, unknown>,
    expected?: number | "absent",
  ): Promise<void>;
  list(prefix: string): Promise<Record<string, unknown>[]>;
  commit(
    assessmentKey: string,
    cache: Record<string, unknown>,
    incidentKey: string,
    incident: Record<string, unknown>,
  ): Promise<void>;
  publish(policy: Policy, expected: number): Promise<void>;
  upload(key: string, mime: string): Promise<unknown>;
  read(key: string): Promise<{ bytes: Uint8Array; mime: string }>;
  remove(key: string): Promise<void>;
  ocr(bytes: Uint8Array): Promise<string>;
  ai(input: string): Promise<unknown>;
}
const unavailable: Assessment = {
  status: "unavailable",
  severity: "none",
  risk: null,
  reason: "ANALYSIS_UNAVAILABLE",
  source: "unavailable",
  explanation:
    "Contextual analysis is unavailable. This assessment is unscored.",
};
export function restricted(
  text: string,
  policy: Policy,
): Assessment | undefined {
  const matches = policy.rules.filter(
    (r) => r.enabled && text.toLowerCase().includes(r.literal.toLowerCase()),
  );
  const block =
    /TL-DEMO-SECRET-[A-Z0-9-]+|\bTHREATLOCK DEMO: RESTRICTED\b/i.test(text) ||
    matches.some((r) => r.action === "block");
  if (block || matches.length)
    return {
      status: block ? "blocked" : "warning",
      severity: block ? "critical" : "caution",
      risk: block ? 100 : 45,
      reason: "RESTRICTED_LITERAL",
      source: "server-policy",
      explanation: block
        ? "Restricted content detected by server policy."
        : "An enabled warning phrase was detected.",
    };
}
function signature(bytes: Uint8Array, mime: string) {
  const b = Buffer.from(bytes);
  return mime === "application/pdf"
    ? b.subarray(0, 5).toString() === "%PDF-"
    : mime === "image/png"
      ? b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      : b[0] === 255 && b[1] === 216 && b[2] === 255;
}
export function handler(ports: Ports, origin: string) {
  return async (event: {
    body?: string;
    rawPath: string;
    requestContext: {
      http: { method: string };
      authorizer?: { jwt?: { claims?: Record<string, string> } };
    };
    headers?: Record<string, string>;
  }) => {
    const response = (statusCode: number, data: unknown) => ({
      statusCode,
      headers: {
        "content-type": "application/json",
        "access-control-allow-origin": origin,
        "cache-control": "no-store",
      },
      body: JSON.stringify(data),
    });
    const subject = event.requestContext.authorizer?.jwt?.claims?.sub;
    if (!subject || !/^[a-zA-Z0-9-]{1,128}$/.test(subject))
      return response(401, { error: "Authentication required" });
    if (event.headers?.origin && event.headers.origin !== origin)
      return response(403, { error: "Origin rejected" });
    if (Buffer.byteLength(event.body ?? "") > 30000)
      return response(413, { error: "Request too large" });
    const prefix = `user#${subject}#`;
    const method = event.requestContext.http.method;
    const path = event.rawPath;
    try {
      const input = event.body ? object(JSON.parse(event.body)) : {};
      if (path === "/policy" && method === "GET")
        return response(
          200,
          (await ports.get("policy#published")) ?? { version: 0, rules: [] },
        );
      if (path === "/policy/stage" && method === "PUT") {
        exact(input, ["version", "rules"]);
        if (!Number.isInteger(input.version) || Number(input.version) < 0)
          throw Error();
        const staged = { version: input.version, rules: rules(input.rules) };
        await ports.put(prefix + "staged", staged);
        return response(200, staged);
      }
      if (path === "/policy/publish" && method === "POST") {
        exact(input, ["version"]);
        const staged = await ports.get(prefix + "staged");
        if (!staged || input.version !== staged.version)
          return response(409, { error: "Stage or version mismatch" });
        const policy = {
          version: Number(staged.version) + 1,
          rules: rules(staged.rules),
        };
        await ports.publish(policy, Number(staged.version));
        return response(200, policy);
      }
      if (path === "/uploads" && method === "POST") {
        exact(input, ["mime"]);
        const mime = string(input.mime, 40);
        if (!(MIME_TYPES as readonly string[]).includes(mime)) throw Error();
        const uploadId = randomUUID();
        const key = `${subject}/${uploadId}`;
        await ports.put(prefix + "upload#" + uploadId, {
          key,
          mime,
          expires: Math.floor(Date.now() / 1000) + 900,
        });
        return response(200, { uploadId, form: await ports.upload(key, mime) });
      }
      if (path === "/incidents" && method === "GET")
        return response(200, await ports.list(prefix + "incident#"));
      if (path === "/incidents" && method === "PATCH") {
        exact(input, ["id", "disposition"]);
        const key = prefix + "incident#" + id(input.id);
        const old = await ports.get(key);
        if (!old) return response(404, { error: "Not found" });
        if (!["acknowledged", "escalated"].includes(String(input.disposition)))
          throw Error();
        await ports.put(key, { ...old, disposition: input.disposition });
        return response(200, { ok: true });
      }
      if (path !== "/assessments" || method !== "POST")
        return response(404, { error: "Not found" });
      const request = check(input);
      try {
        const fingerprint = createHash("sha256")
          .update(JSON.stringify(request))
          .digest("hex");
        const cacheKey = prefix + "assessment#" + request.id;
        const prior = await ports.get(cacheKey);
        if (prior)
          return prior.fingerprint === fingerprint
            ? response(200, prior.result)
            : response(409, { error: "Assessment ID already used" });
        const policy = ((await ports.get("policy#published")) ?? {
          version: 0,
          rules: [],
        }) as unknown as Policy;
        let result = restricted(request.text, policy);
        const extracted: { messageIndex: number | "draft"; text: string }[] =
          [];
        if (result?.status !== "blocked") {
          for (const evidence of request.evidence) {
            const metadata = await ports.get(
              prefix + "upload#" + evidence.uploadId,
            );
            if (!metadata || Number(metadata.expires) < Date.now() / 1000)
              throw Error("Expired evidence");
            const key = String(metadata.key);
            try {
              const data = await ports.read(key);
              if (
                data.bytes.length > MAX_BYTES ||
                data.bytes.length === 0 ||
                data.mime !== metadata.mime ||
                !signature(data.bytes, data.mime)
              )
                throw Error("Invalid attachment");
              const text = await ports.ocr(data.bytes);
              if (text.length > 16000) throw Error("OCR too large");
              extracted.push({ messageIndex: evidence.messageIndex, text });
              const found = restricted(text, policy);
              if (
                found?.status === "blocked" &&
                evidence.messageIndex === "draft"
              ) {
                result = { ...found, reason: "RESTRICTED_ATTACHMENT" };
                break;
              }
              if (found && evidence.messageIndex === "draft") result = found;
            } catch {
              result =
                evidence.messageIndex === "draft"
                  ? {
                      ...unavailable,
                      status: "blocked",
                      reason: "RESTRICTED_ATTACHMENT",
                      severity: "critical",
                      explanation:
                        "Attachment could not be safely inspected; sharing is blocked.",
                    }
                  : unavailable;
              break;
            }
          }
        }
        if (!result) {
          try {
            const candidate = assessment(
              await ports.ai(
                JSON.stringify({
                  draft: request.text,
                  context: request.context,
                  evidence: extracted,
                }),
              ),
            );
            if (
              candidate.source !== "bedrock" ||
              !["allowed", "warning"].includes(candidate.status) ||
              !["CLEAR", "CREDENTIAL_REQUEST", "SOCIAL_ENGINEERING"].includes(
                candidate.reason,
              ) ||
              candidate.risk === null ||
              (candidate.status === "allowed" &&
                (candidate.reason !== "CLEAR" ||
                  candidate.severity !== "none" ||
                  candidate.risk !== 0)) ||
              (candidate.status === "warning" &&
                (candidate.reason === "CLEAR" ||
                  candidate.severity === "none" ||
                  candidate.risk < 1))
            )
              throw Error();
            result = candidate;
          } catch {
            result = unavailable;
          }
        }
        const incident: CloudIncident = {
          id: request.id,
          time: new Date().toISOString(),
          reason: result.reason,
          severity: result.severity,
          risk: result.risk,
          source: result.source,
          policyVersion: policy.version,
          disposition: "open",
        };
        // Cache and incident contain only metadata, never message bodies or model explanations.
        const safe = {
          ...result,
          explanation:
            result.source === "bedrock"
              ? result.status === "allowed"
                ? "Contextual analysis found no warning."
                : "Contextual analysis detected a potential risk; review before sharing."
              : result.explanation,
        };
        await ports.commit(
          cacheKey,
          {
            fingerprint,
            result: safe,
            expires: Math.floor(Date.now() / 1000) + 86400,
          },
          prefix + "incident#" + request.id,
          { ...incident },
        );
        return response(200, safe);
      } finally {
        // Only server-owned references authorize deletion. Cleanup must not change the assessment.
        await Promise.all(
          request.evidence.map(async (evidence) => {
            try {
              const metadata = await ports.get(
                prefix + "upload#" + evidence.uploadId,
              );
              const expectedKey = `${subject}/${evidence.uploadId}`;
              if (metadata?.key === expectedKey)
                await ports.remove(expectedKey);
            } catch {
              // Private-bucket lifecycle is the fallback if lookup or deletion fails.
            }
          }),
        );
      }
    } catch (error) {
      const conflict =
        error instanceof Error &&
        [
          "ConditionalCheckFailedException",
          "TransactionCanceledException",
        ].includes(error.name);
      const invalid =
        error instanceof Error &&
        ["Error", "TypeError", "SyntaxError"].includes(error.name);
      return response(conflict ? 409 : invalid ? 400 : 503, {
        error: conflict
          ? "Concurrent change; reload and retry"
          : invalid
            ? "Invalid request"
            : "Service unavailable; retry later",
      });
    }
  };
}
