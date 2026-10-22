// @vitest-environment jsdom
import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import { cleanup, render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "./App";
import { localAdapter, scenarios, type Analysis } from "./policy";
beforeEach(() => {
  sessionStorage.clear();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe("local walkthrough", () => {
  it("checks a curated warning, overrides it, and retains metadata only in incidents", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Next message" }));
    await user.click(
      screen.getByRole("button", { name: /Check this message/ }),
    );
    await user.click(
      await screen.findByRole("button", { name: /Override warning & send/ }),
    );
    expect(
      screen.getByRole("textbox", { name: "Message draft" }).textContent,
    ).toBe("");
    await user.click(
      screen.getByRole("button", { name: "Security dashboard" }),
    );
    expect(screen.getAllByText("SOCIAL ENGINEERING")).toHaveLength(2);
    const stored = JSON.parse(sessionStorage.getItem("threatlock:v3")!);
    expect(stored.messages.at(-1).outgoing).toBe(true);
    expect(Object.keys(stored.incidents[0]).sort()).toEqual(
      [
        "disposition",
        "direction",
        "personaId",
        "id",
        "reason",
        "risk",
        "severity",
        "source",
        "time",
      ].sort(),
    );
  });
  it("does not duplicate an unchanged assessment or overwrite its reviewed disposition", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Next message" }));
    await user.click(
      screen.getByRole("button", { name: "Check this message" }),
    );
    await user.click(
      screen.getByRole("button", { name: "Check this message" }),
    );
    let saved = JSON.parse(sessionStorage.getItem("threatlock:v3")!);
    expect(saved.incidents).toHaveLength(2);
    expect(
      saved.incidents.filter(
        (event: { direction: string }) => event.direction === "outgoing",
      ),
    ).toHaveLength(1);
    const timestamp = saved.incidents[0].time;
    await user.click(
      screen.getByRole("button", { name: "Security dashboard" }),
    );
    await user.click(screen.getAllByRole("button", { name: "Acknowledge" })[0]);
    await user.click(screen.getByRole("button", { name: "Simulator" }));
    await user.click(
      screen.getByRole("button", { name: "Check this message" }),
    );
    saved = JSON.parse(sessionStorage.getItem("threatlock:v3")!);
    expect(saved.incidents).toHaveLength(2);
    expect(saved.incidents[0].disposition).toBe("acknowledged");
    expect(saved.incidents[0].time).toBe(timestamp);
  });
  it("reveals incoming messages in steps and records the incoming signal once across replays", async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(screen.queryByText(scenarios[1].incoming[1])).toBeNull();
    await user.click(screen.getByRole("button", { name: "Next message" }));
    expect(screen.getByText(scenarios[1].incoming[1])).toBeTruthy();
    let saved = JSON.parse(sessionStorage.getItem("threatlock:v3")!);
    expect(saved.incidents).toHaveLength(1);
    expect(saved.incidents[0].direction).toBe("incoming");
    await user.click(
      screen.getByRole("button", { name: /A little too familiar/ }),
    );
    await user.click(screen.getByRole("button", { name: "Next message" }));
    saved = JSON.parse(sessionStorage.getItem("threatlock:v3")!);
    expect(saved.incidents).toHaveLength(1);
  });
  it("previews unpublished changes, publishes globally, and restores previous content as a new revision", async () => {
    const user = userEvent.setup();
    render(<App />);
    const draft = screen.getByRole("textbox", { name: "Message draft" });
    await user.clear(draft);
    await user.type(draft, "DEMO-SECRET-7842");
    await user.click(screen.getByRole("button", { name: "Rules & policies" }));
    await user.click(
      screen.getByRole("switch", { name: "Enable Secret demo token" }),
    );
    await user.type(
      screen.getByRole("textbox", { name: "Policy preview draft" }),
      "DEMO-SECRET-7842",
    );
    await user.click(screen.getByRole("button", { name: "Run preview" }));
    expect(screen.getByText("Draft policy passed.")).toBeTruthy();
    expect(
      JSON.parse(sessionStorage.getItem("threatlock:v3")!).incidents,
    ).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Simulator" }));
    await user.click(
      screen.getByRole("button", { name: "Check this message" }),
    );
    expect(await screen.findByText("Sensitive data caught.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Rules & policies" }));
    await user.click(screen.getByRole("button", { name: "Publish policy v2" }));
    expect(screen.getByRole("heading", { name: "Policy v2" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Simulator" }));
    await user.click(
      screen.getByRole("button", { name: "Check this message" }),
    );
    expect(await screen.findByText("Context is unavailable.")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Rules & policies" }));
    await user.click(screen.getByRole("button", { name: "Restore v1 as v3" }));
    expect(screen.getByRole("heading", { name: "Policy v3" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Simulator" }));
    await user.click(
      screen.getByRole("button", { name: "Check this message" }),
    );
    expect(await screen.findByText("Sensitive data caught.")).toBeTruthy();
    const saved = JSON.parse(sessionStorage.getItem("threatlock:v3")!);
    expect(saved.policy.version).toBe(3);
    expect(saved.policy.restoredFrom).toBe(1);
  });
  it("keeps seeded persona history separate from live counts", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      screen.getByRole("button", { name: "Security dashboard" }),
    );
    expect(
      screen.getByRole("button", { name: "Live session (0)" }),
    ).toBeTruthy();
    await user.click(
      screen.getByRole("button", { name: "Synthetic history (12)" }),
    );
    for (const name of ["Jamie Davis", "Alex Chen", "Priya Rao"])
      expect(screen.getByRole("heading", { name })).toBeTruthy();
    expect(
      screen.getByRole("heading", {
        name: "Severity distribution · 12 events",
      }),
    ).toBeTruthy();
    await user.selectOptions(
      screen.getByLabelText("Inspect a fictional persona"),
      "alex",
    );
    expect(
      screen.getByRole("heading", { name: "Severity distribution · 4 events" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Acknowledge" })).toBeNull();
    expect(sessionStorage.getItem("threatlock:v3")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Live session (0)" }));
    expect(screen.getByRole("heading", { name: "No events yet" })).toBeTruthy();
  });
  it("shows the screenshot as incoming evidence and binds recorded analysis to that attachment", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      screen.getByRole("button", { name: /A screenshot tells a story/ }),
    );
    expect(
      screen.getByRole("img", {
        name: "Fictional incoming attachment: Account recovery screenshot.png",
      }),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", {
          name: "Preview incoming Account recovery screenshot.png",
        })
        .getAttribute("href"),
    ).toBe("/samples/screen.png");
    const saved = JSON.parse(sessionStorage.getItem("threatlock:v3")!);
    expect(saved.attachmentId).toBe("");
    expect(saved.messages[0].attachmentId).toBe("screen");
    expect(saved.incidents[0].attachmentKind).toBe("image");
    await user.click(
      screen.getByRole("button", { name: "Check this message" }),
    );
    expect(
      await screen.findByRole("button", { name: /Override warning & send/ }),
    ).toBeTruthy();
  });
  it("blocks a restricted attachment without an override", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      screen.getByRole("button", { name: /The confidential handoff/ }),
    );
    await user.click(
      screen.getByRole("button", { name: /Check this message/ }),
    );
    expect(await screen.findByText("Sensitive data caught.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Override/ })).toBeNull();
  });
  it("discards an analysis that finishes after the draft is edited", async () => {
    let resolve!: (value: Analysis) => void;
    vi.spyOn(localAdapter, "analyze").mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const user = userEvent.setup();
    render(<App />);
    await user.click(
      screen.getByRole("button", { name: "Check this message" }),
    );
    await user.clear(screen.getByRole("textbox", { name: "Message draft" }));
    await user.type(
      screen.getByRole("textbox", { name: "Message draft" }),
      "Changed while checking",
    );
    await act(async () =>
      resolve({
        status: "blocked",
        severity: "critical",
        risk: 100,
        reason: "RESTRICTED_LITERAL",
        source: "local-policy",
        explanation: "Stale result",
      }),
    );
    expect(screen.queryByText("Stale result")).toBeNull();
    expect(screen.queryByText("Sensitive data caught.")).toBeNull();
    expect(
      JSON.parse(sessionStorage.getItem("threatlock:v3")!).incidents,
    ).toHaveLength(0);
  });
  it("invalidates recorded analysis when a draft changes", async () => {
    const user = userEvent.setup();
    render(<App />);
    const draft = screen.getByRole("textbox", { name: "Message draft" });
    await user.clear(draft);
    await user.type(draft, "A custom fictional message");
    await user.click(
      screen.getByRole("button", { name: /Check this message/ }),
    );
    await waitFor(() =>
      expect(
        screen.getByText(/no recorded contextual result matches this draft/),
      ).toBeTruthy(),
    );
    expect(screen.getByText("unscored")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Override/ })).toBeNull();
  });
});
