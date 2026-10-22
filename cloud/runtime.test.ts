import { describe, it, expect, vi } from "vitest";
import { handler, type Ports } from "./runtime";
function fixture() {
  const records = new Map<string, Record<string, unknown>>();
  const ports: Ports = {
    get: vi.fn(async (key) => records.get(key)),
    put: vi.fn(async (key, value) => {
      records.set(key, value);
    }),
    publish: vi.fn(async (policy) => {
      records.set(
        "policy#published",
        policy as unknown as Record<string, unknown>,
      );
    }),
    commit: vi.fn(async (a, b, c, d) => {
      records.set(a, b);
      records.set(c, d);
    }),
    list: vi.fn(async () => []),
    upload: vi.fn(async () => ({})),
    read: vi.fn(async () => ({
      bytes: Buffer.from("%PDF-1.4 sample"),
      mime: "application/pdf",
    })),
    remove: vi.fn(async () => {}),
    ocr: vi.fn(async () => "Public community agenda"),
    ai: vi.fn(async () => ({
      status: "allowed",
      reason: "CLEAR",
      severity: "none",
      risk: 0,
      source: "bedrock",
      explanation: "unsafe model output containing private text",
    })),
  };
  const invoke = (
    path: string,
    body?: unknown,
    method = "POST",
    subject = "presenter-123",
  ) =>
    handler(
      ports,
      "https://demo.test",
    )({
      rawPath: path,
      body: body ? JSON.stringify(body) : undefined,
      requestContext: {
        http: { method },
        authorizer: { jwt: { claims: { sub: subject } } },
      },
    });
  return { ports, records, invoke };
}
const request = {
  id: "assessment-123",
  text: "hello",
  context: ["previous message"],
  evidence: [],
};
describe("cloud runtime security boundaries", () => {
  it("requires authenticated identity and rejects fixture-only fields", async () => {
    const f = fixture();
    expect(
      (await f.invoke("/assessments", request, "POST", "")).statusCode,
    ).toBe(401);
    expect(
      (await f.invoke("/assessments", { ...request, fixtureId: "benign" }))
        .statusCode,
    ).toBe(400);
    expect(f.ports.ai).not.toHaveBeenCalled();
  });
  it("blocks deterministic restrictions in drafts before AI", async () => {
    const f = fixture();
    const response = await f.invoke("/assessments", {
      ...request,
      text: "THREATLOCK DEMO: RESTRICTED",
    });
    expect(JSON.parse(response.body).status).toBe("blocked");
    expect(f.ports.ai).not.toHaveBeenCalled();
  });
  it("stores metadata only and deduplicates without calling AI again", async () => {
    const f = fixture();
    const response = await f.invoke("/assessments", request);
    expect(response.statusCode).toBe(200);
    await f.invoke("/assessments", request);
    expect(f.ports.ai).toHaveBeenCalledTimes(1);
    expect(JSON.stringify([...f.records.values()])).not.toContain(
      "previous message",
    );
    expect(JSON.stringify([...f.records.values()])).not.toContain(
      "private text",
    );
    expect(
      (await f.invoke("/assessments", { ...request, text: "different" }))
        .statusCode,
    ).toBe(409);
  });
  it("fails closed on missing/invalid attachments and never trusts classification", async () => {
    const f = fixture();
    f.records.set("user#presenter-123#upload#upload-123", {
      key: "presenter-123/upload-123",
      mime: "application/pdf",
      expires: Date.now() / 1000 + 900,
    });
    vi.mocked(f.ports.read).mockResolvedValue({
      bytes: Buffer.from("not pdf"),
      mime: "application/pdf",
    });
    const response = await f.invoke("/assessments", {
      ...request,
      evidence: [{ uploadId: "upload-123", messageIndex: "draft" }],
    });
    expect(JSON.parse(response.body).status).toBe("blocked");
    expect(f.ports.ai).not.toHaveBeenCalled();
    expect(f.ports.remove).toHaveBeenCalled();
  });
  it("passes verified OCR and message provenance into AI", async () => {
    const f = fixture();
    f.records.set("user#presenter-123#upload#upload-123", {
      key: "presenter-123/upload-123",
      mime: "application/pdf",
      expires: Date.now() / 1000 + 900,
    });
    await f.invoke("/assessments", {
      ...request,
      evidence: [{ uploadId: "upload-123", messageIndex: 0 }],
    });
    expect(f.ports.ai).toHaveBeenCalledWith(
      expect.stringContaining('"messageIndex":0'),
    );
    expect(f.ports.remove).toHaveBeenCalled();
  });
  it("AI outage is explicitly unscored", async () => {
    const f = fixture();
    vi.mocked(f.ports.ai).mockRejectedValue(Error("Service outage"));
    const response = await f.invoke("/assessments", request);
    expect(JSON.parse(response.body)).toMatchObject({
      status: "unavailable",
      risk: null,
      source: "unavailable",
    });
  });
  it("publishes only staged version with conditional transaction", async () => {
    const f = fixture();
    expect((await f.invoke("/policy/publish", { version: 0 })).statusCode).toBe(
      409,
    );
    await f.invoke("/policy/stage", { version: 0, rules: [] }, "PUT");
    await f.invoke("/policy/publish", { version: 0 });
    expect(f.ports.publish).toHaveBeenCalledWith({ version: 1, rules: [] }, 0);
  });
  it("does not allow other users to reference an upload", async () => {
    const f = fixture();
    f.records.set("user#other#upload#upload-123", { key: "other/upload-123" });
    expect(
      (
        await f.invoke("/assessments", {
          ...request,
          evidence: [{ uploadId: "upload-123", messageIndex: "draft" }],
        })
      ).statusCode,
    ).toBe(400);
    expect(f.ports.read).not.toHaveBeenCalled();
  });
  it("rejects inconsistent allowed AI responses as explicitly unscored", async () => {
    const f = fixture();
    vi.mocked(f.ports.ai).mockResolvedValue({
      status: "allowed",
      reason: "CREDENTIAL_REQUEST",
      severity: "critical",
      risk: 95,
      source: "bedrock",
      explanation: "Inconsistent output",
    });
    const response = await f.invoke("/assessments", request);
    expect(JSON.parse(response.body)).toMatchObject({
      status: "unavailable",
      risk: null,
      source: "unavailable",
    });
  });
  it("returns a service status for unexpected AWS faults without leaking details", async () => {
    const f = fixture();
    const error = Object.assign(Error("sensitive internal service details"), {
      name: "ServiceUnavailableException",
    });
    vi.mocked(f.ports.get).mockRejectedValue(error);
    const response = await f.invoke("/policy", undefined, "GET");
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain("sensitive");
  });
  it("cleans owned evidence on deterministic text blocks without calling OCR", async () => {
    const f = fixture();
    f.records.set("user#presenter-123#upload#upload-123", {
      key: "presenter-123/upload-123",
      mime: "application/pdf",
      expires: Date.now() / 1000 + 900,
    });
    const response = await f.invoke("/assessments", {
      ...request,
      text: "THREATLOCK DEMO: RESTRICTED",
      evidence: [{ uploadId: "upload-123", messageIndex: "draft" }],
    });
    expect(JSON.parse(response.body).status).toBe("blocked");
    expect(f.ports.remove).toHaveBeenCalledWith("presenter-123/upload-123");
    expect(f.ports.ocr).not.toHaveBeenCalled();
  });
  it("cleans remaining owned evidence after an early exit, even if one deletion fails", async () => {
    const f = fixture();
    for (const uploadId of ["upload-123", "upload-456"])
      f.records.set("user#presenter-123#upload#" + uploadId, {
        key: "presenter-123/" + uploadId,
        mime: "application/pdf",
        expires: Date.now() / 1000 + 900,
      });
    vi.mocked(f.ports.ocr).mockResolvedValue("THREATLOCK DEMO: RESTRICTED");
    vi.mocked(f.ports.remove).mockRejectedValueOnce(
      Error("private service detail"),
    );
    const response = await f.invoke("/assessments", {
      ...request,
      evidence: [
        { uploadId: "upload-123", messageIndex: "draft" },
        { uploadId: "upload-456", messageIndex: "draft" },
      ],
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).status).toBe("blocked");
    expect(response.body).not.toContain("private service detail");
    expect(f.ports.ocr).toHaveBeenCalledTimes(1);
    expect(f.ports.remove).toHaveBeenCalledWith("presenter-123/upload-123");
    expect(f.ports.remove).toHaveBeenCalledWith("presenter-123/upload-456");
  });
  it("never cleans an unowned object key", async () => {
    const f = fixture();
    f.records.set("user#presenter-123#upload#upload-123", {
      key: "another-presenter/upload-123",
    });
    await f.invoke("/assessments", {
      ...request,
      text: "THREATLOCK DEMO: RESTRICTED",
      evidence: [{ uploadId: "upload-123", messageIndex: "draft" }],
    });
    expect(f.ports.remove).not.toHaveBeenCalled();
  });
});
