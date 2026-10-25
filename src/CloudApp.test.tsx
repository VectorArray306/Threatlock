// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CloudApp from "./CloudApp";
const mocks = vi.hoisted(() => ({
  analyze: vi.fn(),
  policy: vi.fn(async () => ({ version: 0, rules: [] })),
  incidents: vi.fn(async () => []),
}));
vi.mock("./cloudAdapter", () => ({
  cloudConfig: () => ({}),
  completeSignIn: async () => "identity-token",
  cloudAdapter: () => mocks,
  signIn: vi.fn(),
  signOut: vi.fn(),
}));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
describe("cloud send guards", () => {
  it("requires explicit warning override, sends in the phone and invalidates after edits", async () => {
    mocks.analyze.mockResolvedValue({
      status: "warning",
      reason: "SOCIAL_ENGINEERING",
      severity: "high",
      risk: 80,
      source: "bedrock",
      explanation: "Review this request.",
    });
    const user = userEvent.setup();
    render(<CloudApp />);
    await screen.findByLabelText("Draft");
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Check conversation",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    await user.type(
      screen.getByLabelText("Context (one message per line, up to 20)"),
      "Hello from cloud",
    );
    await user.type(screen.getByLabelText("Draft"), "Hello from cloud");
    await user.click(
      screen.getByRole("button", { name: "Check conversation" }),
    );
    const send = await screen.findByRole("button", {
      name: "Send in demonstration",
    });
    expect((send as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("checkbox"));
    await user.click(send);
    expect(
      screen.getByLabelText("Cloud Android conversation").textContent,
    ).toContain("Hello from cloud");
    const bubbles = screen
      .getByLabelText("Cloud Android conversation")
      .querySelectorAll(".bubble");
    expect(bubbles).toHaveLength(2);
    expect(bubbles[0].classList.contains("outgoing")).toBe(false);
    expect(bubbles[1].classList.contains("outgoing")).toBe(true);
    expect(
      screen.queryByRole("button", { name: "Send in demonstration" }),
    ).toBeNull();
  });
  it("blocks restricted sends and never substitutes recorded fixtures", async () => {
    mocks.analyze.mockResolvedValue({
      status: "blocked",
      reason: "RESTRICTED_LITERAL",
      severity: "critical",
      risk: 100,
      source: "server-policy",
      explanation: "Restricted content.",
    });
    const user = userEvent.setup();
    render(<CloudApp />);
    await screen.findByLabelText("Draft");
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Check conversation",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    await user.type(screen.getByLabelText("Draft"), "restricted draft");
    await user.click(
      screen.getByRole("button", { name: "Check conversation" }),
    );
    expect(
      (
        (await screen.findByRole("button", {
          name: "Send in demonstration",
        })) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(mocks.analyze.mock.calls[0][0]).not.toHaveProperty("fixtureId");
    await user.type(screen.getByLabelText("Draft"), " edited");
    expect(
      screen.queryByRole("button", { name: "Send in demonstration" }),
    ).toBeNull();
  });
  it("requires deliberate unscored send when AI is unavailable", async () => {
    mocks.analyze.mockResolvedValue({
      status: "unavailable",
      reason: "ANALYSIS_UNAVAILABLE",
      severity: "none",
      risk: null,
      source: "unavailable",
      explanation: "Analysis unavailable.",
    });
    const user = userEvent.setup();
    render(<CloudApp />);
    await screen.findByLabelText("Draft");
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Check conversation",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    await user.type(screen.getByLabelText("Draft"), "public draft");
    await user.click(
      screen.getByRole("button", { name: "Check conversation" }),
    );
    expect(
      (
        (await screen.findByRole("button", {
          name: "Send in demonstration",
        })) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(screen.getByRole("checkbox").parentElement?.textContent).toContain(
      "unscored",
    );
  });
  it("reuses one assessment id until the draft or context changes", async () => {
    mocks.analyze.mockResolvedValue({
      status: "allowed",
      reason: "CLEAR",
      severity: "none",
      risk: 0,
      source: "bedrock",
      explanation: "Contextual analysis found no warning.",
    });
    const user = userEvent.setup();
    render(<CloudApp />);
    await screen.findByLabelText("Draft");
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Check conversation",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    await user.type(screen.getByLabelText("Draft"), "public agenda");
    const check = screen.getByRole("button", { name: "Check conversation" });
    await user.click(check);
    await screen.findByRole("status");
    await user.click(check);
    await screen.findByRole("status");
    expect(mocks.analyze.mock.calls[0][0].id).toBe(
      mocks.analyze.mock.calls[1][0].id,
    );
    await user.type(screen.getByLabelText("Draft"), " changed");
    await user.click(
      screen.getByRole("button", { name: "Check conversation" }),
    );
    expect(mocks.analyze.mock.calls[2][0].id).not.toBe(
      mocks.analyze.mock.calls[0][0].id,
    );
  });
  it("returns to sign-in when the API reports an expired session", async () => {
    mocks.analyze.mockRejectedValue(
      new Error("Session expired; sign in again."),
    );
    const user = userEvent.setup();
    render(<CloudApp />);
    await screen.findByLabelText("Draft");
    await waitFor(() =>
      expect(
        (
          screen.getByRole("button", {
            name: "Check conversation",
          }) as HTMLButtonElement
        ).disabled,
      ).toBe(false),
    );
    await user.click(
      screen.getByRole("button", { name: "Check conversation" }),
    );
    expect(
      await screen.findByRole("button", { name: "Sign in with Cognito" }),
    ).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Session expired");
  });
});
