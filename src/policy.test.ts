import { describe, it, expect } from "vitest";
import {
  localAdapter,
  initialRules,
  scenarios,
  attachments,
  validateLiteral,
  cloudContext,
  evaluateLocal,
} from "./policy";
describe("deterministic boundaries", () => {
  it("blocks secrets case insensitively even without contextual analysis", async () => {
    expect(
      (
        await localAdapter.analyze(
          { text: "Here: demo-secret-7842" },
          initialRules,
        )
      ).risk,
    ).toBe(100);
  });
  it("supports warning rules while built-in secret formats stay blocked", async () => {
    const rules = [
      { ...initialRules[0], literal: "demo phrase", action: "warn" as const },
    ];
    expect(
      (await localAdapter.analyze({ text: "a demo phrase" }, rules)).status,
    ).toBe("warning");
    expect(
      (await localAdapter.analyze({ text: "TL-DEMO-SECRET-ABCD" }, [])).status,
    ).toBe("blocked");
  });
  it("blocks only the deliberate restricted marker, not ordinary use of the word", async () => {
    expect(
      (
        await localAdapter.analyze(
          { text: "The gallery has restricted opening hours." },
          [],
        )
      ).status,
    ).toBe("unavailable");
    expect(
      (
        await localAdapter.analyze(
          { text: "threatlock demo: restricted — synthetic sample" },
          [],
        )
      ).status,
    ).toBe("blocked");
  });
  it("honors disabled rules", () => {
    expect(
      evaluateLocal(
        { text: "DEMO-SECRET-7842" },
        initialRules.map((r) => ({ ...r, enabled: false })),
      ),
    ).toBeUndefined();
  });
  it("blocks classified attachments", async () => {
    expect(
      (
        await localAdapter.analyze(
          { text: "hello", attachment: attachments[1] },
          [],
        )
      ).reason,
    ).toBe("RESTRICTED_ATTACHMENT");
  });
  it("bounds literal rules", () => {
    expect(validateLiteral("", [])).toBeTruthy();
    expect(validateLiteral("x".repeat(121), [])).toBeTruthy();
    expect(
      validateLiteral(
        "x",
        Array.from({ length: 50 }, () => initialRules[0]),
      ),
    ).toBeTruthy();
    expect(validateLiteral("demo-secret-7842", initialRules)).toBeTruthy();
  });
});
describe("recorded contextual analysis", () => {
  it("uses only the exact fixture text and attachment", async () => {
    const s = scenarios.find((s) => s.id === "credential")!;
    expect(
      (
        await localAdapter.analyze(
          { text: s.draft, fixtureId: s.id, context: s.incoming },
          initialRules,
        )
      ).risk,
    ).toBe(95);
    expect(
      (
        await localAdapter.analyze(
          { text: s.draft, fixtureId: s.id, context: ["changed context"] },
          initialRules,
        )
      ).status,
    ).toBe("unavailable");
    expect(
      (
        await localAdapter.analyze(
          { text: s.draft + " changed", fixtureId: s.id, context: s.incoming },
          initialRules,
        )
      ).status,
    ).toBe("unavailable");
    expect(
      (
        await localAdapter.analyze(
          {
            text: s.draft,
            fixtureId: s.id,
            context: s.incoming,
            attachment: attachments[0],
          },
          initialRules,
        )
      ).status,
    ).toBe("unavailable");
  });
  it("requires the exact incoming image evidence for a recorded screenshot result", async () => {
    const fixture = scenarios.find((s) => s.id === "screenshot")!;
    const request = {
      text: fixture.draft,
      fixtureId: fixture.id,
      context: fixture.incoming,
    };
    expect((await localAdapter.analyze(request, initialRules)).status).toBe(
      "unavailable",
    );
    expect(
      (
        await localAdapter.analyze(
          { ...request, incomingAttachmentIds: ["screen"] },
          initialRules,
        )
      ).status,
    ).toBe("warning");
    expect(
      (
        await localAdapter.analyze(
          { ...request, incomingAttachmentIds: ["public-image"] },
          initialRules,
        )
      ).status,
    ).toBe("unavailable");
  });
  it("labels arbitrary typed text as unanalysed by live AI", async () => {
    const result = await localAdapter.analyze(
      { text: "Can you send the code?" },
      initialRules,
    );
    expect(result.source).toBe("unavailable");
    expect(result.explanation).toContain("Live AI is not connected");
  });
  it("does not bypass rules during an outage", async () => {
    expect(
      (
        await localAdapter.analyze(
          { text: "PROJECT NIGHTFALL", fixtureId: "outage" },
          initialRules,
        )
      ).status,
    ).toBe("blocked");
  });
  it("bounds future cloud context by count and character budget", () => {
    expect(
      cloudContext(Array.from({ length: 30 }, (_, i) => String(i))),
    ).toHaveLength(20);
    expect(
      cloudContext(Array.from({ length: 20 }, () => "x".repeat(2000))),
    ).toHaveLength(8);
  });
});
