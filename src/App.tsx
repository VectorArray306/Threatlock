import { useState, useRef } from "react";
import {
  ShieldCheck,
  MessageSquare,
  LayoutDashboard,
  SlidersHorizontal,
  ArrowUpRight,
  ChevronRight,
  Paperclip,
  Send,
  Check,
  Lock,
  ArrowLeft,
  MoreVertical,
  Info,
  CheckCheck,
  Activity,
  EyeOff,
} from "lucide-react";
import {
  attachments,
  evaluateLocal,
  localAdapter,
  scenarios,
  validateLiteral,
  type Analysis,
  type Incident,
  type Status,
} from "./policy";
import "./style.css";
import {
  STORAGE_KEY,
  appendIncident,
  fresh,
  incomingSignal,
  matchesIncomingContext,
  publishRevision,
  read,
  scenarioStart,
  type Session,
} from "./session";
import Dashboard from "./Dashboard";
export default function App() {
  const revision = useRef(0);
  const [session, setSession] = useState<Session>(read);
  const [view, setView] = useState("Simulator");
  const [status, setStatus] = useState<Status>("editing");
  const [analysis, setAnalysis] = useState<Analysis>();
  const [literal, setLiteral] = useState("");
  const [action, setAction] = useState<"warn" | "block">("block");
  const [ruleError, setRuleError] = useState("");
  const [attachmentOpen, setAttachmentOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [preview, setPreview] = useState("");
  const [previewResult, setPreviewResult] = useState("");
  const scenario = scenarios.find((s) => s.id === session.scenario)!;
  const incomingAssessment = matchesIncomingContext(scenario, session.messages)
    ? scenario.incomingAssessment
    : undefined;
  const attachment = attachments.find((a) => a.id === session.attachmentId);
  const update = (
    partial: Partial<Session> | ((previous: Session) => Partial<Session>),
  ) => {
    const changesAssessment =
      typeof partial !== "function" &&
      ["draft", "messages", "attachmentId", "policy", "scenario"].some(
        (key) => key in partial,
      );
    if (changesAssessment) revision.current++;
    setSession((previous) => {
      const values =
        typeof partial === "function" ? partial(previous) : partial;
      const next = {
        ...previous,
        ...values,
        assessmentRevision:
          previous.assessmentRevision + (changesAssessment ? 1 : 0),
      };
      try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        setNotice(
          "Session storage is unavailable. Changes last only until this page closes.",
        );
      }
      return next;
    });
  };
  const edit = (draft: string) => {
    update({ draft });
    setStatus("editing");
    setAnalysis(undefined);
  };
  const load = (id: string) => {
    const selected = scenarios.find((item) => item.id === id)!;
    const start = scenarioStart(selected);
    const signal = incomingSignal(selected, start.messages);
    update({
      ...start,
      incidents: signal
        ? appendIncident(session.incidents, signal)
        : session.incidents,
    });
    setStatus("editing");
    setAnalysis(undefined);
    setNotice("");
  };
  const nextIncoming = () => {
    if (
      session.incomingStep >= scenario.incoming.length ||
      session.messages.length >= 200
    )
      return;
    const messages = [
      ...session.messages,
      { text: scenario.incoming[session.incomingStep], outgoing: false },
    ];
    const signal = incomingSignal(scenario, messages);
    update({
      messages,
      incomingStep: session.incomingStep + 1,
      incidents: signal
        ? appendIncident(session.incidents, signal)
        : session.incidents,
    });
    setStatus("editing");
    setAnalysis(undefined);
  };
  const log = (
    a: Analysis,
    disposition: Incident["disposition"] = "open",
    direction: Incident["direction"] = "outgoing",
  ) => {
    const incident: Incident = {
      id: `${direction}-${session.assessmentRevision}`,
      time: new Date().toISOString(),
      reason: a.reason,
      severity: a.severity,
      risk: a.risk,
      source: a.source,
      attachmentKind: attachment?.kind,
      disposition,
      direction,
      personaId: "jamie",
    };
    update((previous) => ({
      incidents: appendIncident(previous.incidents, incident),
    }));
  };
  const check = async () => {
    const current = ++revision.current;
    setStatus("checking");
    const result = await localAdapter.analyze(
      {
        text: session.draft,
        attachment,
        fixtureId: session.scenario,
        context: session.messages.map((m) => m.text),
        incomingAttachmentIds: session.messages
          .filter((message) => !message.outgoing)
          .flatMap((message) =>
            message.attachmentId ? [message.attachmentId] : [],
          ),
      },
      session.policy.rules,
    );
    if (current !== revision.current) return;
    setAnalysis(result);
    setStatus(result.status);
    if (result.status === "warning" || result.status === "blocked") log(result);
  };
  const send = () => {
    if (
      status === "blocked" ||
      !session.draft.trim() ||
      session.messages.length >= 200
    )
      return;
    update({
      messages: [
        ...session.messages,
        {
          text: session.draft,
          ...(attachment ? { attachmentId: attachment.id } : {}),
          outgoing: true,
        },
      ],
      draft: "",
      attachmentId: "",
    });
    setStatus("sent");
    setAnalysis(undefined);
    setNotice("Message sent within this local simulator.");
  };
  const escalate = () => {
    log(
      {
        status: "warning",
        severity: "high",
        risk: 80,
        reason: "MANUAL_ESCALATION",
        source: "local-policy",
        explanation: "Presenter requested review.",
      },
      "escalated",
      "manual",
    );
    setNotice("Escalated locally. The dashboard stores metadata only.");
  };
  const policyDirty =
    JSON.stringify(session.draftRules) !== JSON.stringify(session.policy.rules);
  const publish = () => {
    if (!policyDirty) return;
    update({
      previousPolicy: session.policy,
      policy: publishRevision(session.policy, session.draftRules),
    });
    setAnalysis(undefined);
    setStatus("editing");
    setNotice(`Policy v${session.policy.version + 1} published locally.`);
  };
  const restore = () => {
    if (!session.previousPolicy) return;
    const restored = publishRevision(
      session.policy,
      session.previousPolicy.rules,
      session.previousPolicy.version,
    );
    update({
      previousPolicy: session.policy,
      policy: restored,
      draftRules: restored.rules.map((rule) => ({ ...rule })),
    });
    setAnalysis(undefined);
    setStatus("editing");
    setPreviewResult("");
    setNotice(
      `Policy v${restored.version} restores the content of v${restored.restoredFrom}.`,
    );
  };

  return (
    <div className="app">
      <aside className="sidebar">
        <a href="#" className="brand" onClick={(e) => e.preventDefault()}>
          <span className="brandmark">
            <ShieldCheck size={23} />
          </span>
          threatlock<span className="brand-dot">.</span>
        </a>
        <div className="workspace">
          <span className="workspace-icon">A</span>
          <div>
            Acme Workspace<small>Development environment</small>
          </div>
          <span className="workspace-dot" />
        </div>
        <span className="nav-label">WORKSPACE</span>
        <nav>
          {[
            { name: "Simulator", icon: MessageSquare },
            { name: "Security dashboard", icon: LayoutDashboard },
            { name: "Rules & policies", icon: SlidersHorizontal },
            { name: "How it works", icon: Info },
          ].map(({ name, icon: Icon }) => (
            <button
              className={view === name ? "active" : ""}
              key={name}
              onClick={() => {
                setView(name);
                window.scrollTo(0, 0);
              }}
            >
              <Icon size={19} />
              {name}
              {name === "Simulator" && <span className="nav-live" />}
            </button>
          ))}
        </nav>
        <div className="side-bottom">
          <div className="local-card">
            <Lock size={16} />
            <strong>Local by design</strong>
            <p>
              Your demo stays in this browser.
              <br />
              No cloud services connected.
            </p>
          </div>
          <div className="profile">
            <span>JD</span>
            <div>
              Jamie Davis<small>Demo presenter</small>
            </div>
            <MoreVertical size={16} />
          </div>
        </div>
      </aside>
      <div className="body">
        <header>
          <div>
            <span className="breadcrumb">Workspace</span>
            <ChevronRight size={13} />
            <strong>{view}</strong>
          </div>
          <span className="dev-badge">
            <span />
            Development mode
          </span>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">CONVERSATION SECURITY</div>
              <h1>
                {view === "Simulator"
                  ? "A safer conversation starts here."
                  : view === "Security dashboard"
                    ? "Your security, at a glance."
                    : view === "Rules & policies"
                      ? "Clear boundaries. Safer sharing."
                      : "Protection with context."}
              </h1>
              <p>
                {view === "Simulator"
                  ? "See how Threatlock catches sensitive data and suspicious requests before you hit send."
                  : view === "Security dashboard"
                    ? "Review local security events without retaining conversation content."
                    : view === "Rules & policies"
                      ? "Deterministic rules protect restricted information before contextual analysis."
                      : "A transparent walkthrough of the local demonstration and future integration."}
              </p>
            </div>
            <span className="outline-badge">
              <span />
              Local demo
            </span>
          </div>
          {view === "Simulator" ? (
            <>
              <div className="demo-banner">
                <Info size={18} />
                <span>
                  <strong>A safe place to explore.</strong> All conversations
                  and attachments are fictional. Exact scenarios use recorded
                  results; live AI is not connected.
                </span>
              </div>
              <div className="sim-grid">
                <section className="scenario-panel">
                  <div className="section-top">
                    <span className="eyebrow">TRY A SCENARIO</span>
                    <span className="count">08</span>
                  </div>
                  <h2>Real risks. Safe practice.</h2>
                  <p>
                    Choose a conversation to see protection in action, or write
                    your own draft.
                  </p>
                  <div className="scenario-list">
                    {scenarios.map((s, index) => (
                      <button
                        className={s.id === session.scenario ? "selected" : ""}
                        key={s.id}
                        onClick={() => load(s.id)}
                      >
                        <span className="scenario-num">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <span>
                          <strong>{s.name}</strong>
                          <small>{s.category}</small>
                        </span>
                        <ChevronRight size={16} />
                      </button>
                    ))}
                  </div>
                  <div className="tip">
                    <ShieldCheck size={20} />
                    <p>
                      <strong>You’re always in control.</strong>
                      <br />
                      Contextual warnings can be overridden. Restricted data
                      stays blocked.
                    </p>
                  </div>
                </section>
                <section className="phone-area" aria-label="Chat simulator">
                  <div className="phone">
                    <div className="phone-status">
                      <strong>9:41</strong>
                      <span>▮▮▮ &nbsp;◔ &nbsp;▰</span>
                    </div>
                    <div className="chat-header">
                      <ArrowLeft size={20} />
                      <span className="avatar">
                        MR
                        <span />
                      </span>
                      <div>
                        <strong>Morgan Reed</strong>
                        <small>Demo contact · online</small>
                      </div>
                      <MoreVertical size={20} />
                    </div>
                    <div className="scenario-progress">
                      <span>
                        Incoming {session.incomingStep} of{" "}
                        {scenario.incoming.length}
                      </span>
                      <button
                        disabled={
                          session.incomingStep >= scenario.incoming.length ||
                          session.messages.length >= 200
                        }
                        onClick={nextIncoming}
                      >
                        {session.incomingStep >= scenario.incoming.length
                          ? "All messages received"
                          : "Next message"}
                        <ChevronRight size={14} />
                      </button>
                    </div>
                    <div className="chat-thread">
                      <span className="chat-date">TODAY, 9:41 AM</span>
                      <div className="encrypted">
                        <Lock size={10} /> Fictional conversation · local only
                      </div>
                      {session.messages.map((m, index) => (
                        <div
                          key={index}
                          className={`bubble ${m.outgoing ? "outgoing" : ""}`}
                        >
                          {m.text}
                          {m.attachmentId &&
                            (() => {
                              const file = attachments.find(
                                (attachment) =>
                                  attachment.id === m.attachmentId,
                              );
                              return file ? (
                                <a
                                  className="message-file"
                                  href={file.path}
                                  target="_blank"
                                  rel="noreferrer"
                                  aria-label={`Preview ${m.outgoing ? "outgoing" : "incoming"} ${file.name}`}
                                >
                                  {file.kind === "image" && (
                                    <img
                                      src={file.path}
                                      alt={`Fictional ${m.outgoing ? "outgoing" : "incoming"} attachment: ${file.name}`}
                                    />
                                  )}
                                  <span>
                                    <Paperclip size={12} />
                                    {file.name}
                                  </span>
                                </a>
                              ) : null;
                            })()}
                          <small>
                            9:41 {m.outgoing && <CheckCheck size={12} />}
                          </small>
                        </div>
                      ))}
                      <div
                        className={`floating-status ${status === "blocked" ? "danger" : status === "warning" || incomingAssessment ? "caution" : status === "unavailable" ? "unavailable" : ""}`}
                      >
                        <ShieldCheck size={18} />
                        <span>
                          {status === "checking"
                            ? "Checking draft"
                            : status === "blocked"
                              ? "Sharing blocked"
                              : status === "unavailable"
                                ? "Live AI unavailable"
                                : status === "warning"
                                  ? "Review draft warning"
                                  : incomingAssessment
                                    ? "Recorded incoming warning"
                                    : "Local protection ready"}
                        </span>
                        <span className="pulse" />
                      </div>
                    </div>
                    <div className="composer">
                      {attachment && (
                        <div className="attached">
                          <Paperclip size={13} />
                          {attachment.name}
                          <a
                            href={attachment.path}
                            target="_blank"
                            rel="noreferrer"
                            aria-label="Preview fictional attachment"
                          >
                            Preview
                          </a>
                          <button
                            aria-label="Remove attachment"
                            onClick={() => {
                              update({ attachmentId: "" });
                              setStatus("editing");
                              setAnalysis(undefined);
                            }}
                          >
                            ×
                          </button>
                        </div>
                      )}
                      <textarea
                        aria-label="Message draft"
                        maxLength={2000}
                        placeholder="Write a fictional message…"
                        value={session.draft}
                        onChange={(e) => edit(e.target.value)}
                      />
                      <div className="compose-actions">
                        <button
                          aria-label="Choose fictional attachment"
                          onClick={() => setAttachmentOpen(!attachmentOpen)}
                        >
                          <Paperclip size={19} />
                        </button>
                        <span>{session.draft.length}/2000</span>
                        <button
                          className="send-icon"
                          aria-label="Check message before sending"
                          disabled={
                            !session.draft.trim() ||
                            status === "checking" ||
                            session.messages.length >= 200
                          }
                          onClick={check}
                        >
                          <Send size={18} />
                        </button>
                      </div>
                      {attachmentOpen && (
                        <div className="attachment-picker">
                          {attachments.map((a) => (
                            <button
                              key={a.id}
                              onClick={() => {
                                update({ attachmentId: a.id });
                                setStatus("editing");
                                setAnalysis(undefined);
                                setAttachmentOpen(false);
                              }}
                            >
                              <strong>{a.name}</strong>
                              <small>{a.description}</small>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="phone-bottom" />
                  </div>
                </section>
                <section className="insight-panel">
                  <div className="section-top">
                    <span className="eyebrow">THREATLOCK INSIGHTS</span>
                    <span className="signal">
                      <Activity size={13} /> LOCAL
                    </span>
                  </div>
                  <div
                    className={`protection-symbol ${status === "blocked" ? "red" : status === "warning" || status === "unavailable" || incomingAssessment ? "amber" : ""}`}
                  >
                    <ShieldCheck size={34} />
                  </div>
                  <h2>
                    {status === "blocked"
                      ? "Sensitive data caught."
                      : status === "warning"
                        ? "Pause. Take a closer look."
                        : status === "unavailable"
                          ? "Context is unavailable."
                          : status === "sent"
                            ? "Message delivered locally."
                            : incomingAssessment
                              ? "An incoming request needs a look."
                              : "Protection that understands."}
                  </h2>
                  <p>
                    {analysis?.explanation ||
                      "Check your draft to see how local policy and recorded contextual insights work together."}
                  </p>
                  {scenario.incomingAssessment &&
                    matchesIncomingContext(scenario, session.messages) && (
                      <div className="incoming-assessment">
                        <strong>
                          Incoming conversation · recorded{" "}
                          {scenario.incomingAssessment.severity} signal
                        </strong>
                        <p>{scenario.incomingAssessment.explanation}</p>
                        <small>
                          Exact curated conversation only · no live AI
                        </small>
                      </div>
                    )}
                  <div className="analysis-steps">
                    <div>
                      <span className="step-icon">
                        <Check size={14} />
                      </span>
                      <div>
                        <strong>Deterministic policy</strong>
                        <small>
                          Enabled literal rules + attachment classification
                        </small>
                      </div>
                      <span className="mini-badge">LOCAL</span>
                    </div>
                    <div>
                      <span className="step-icon muted">2</span>
                      <div>
                        <strong>Contextual analysis</strong>
                        <small>
                          {analysis?.source === "recorded-fixture"
                            ? "Recorded result · exact scenario only"
                            : "Live AI not connected"}
                        </small>
                      </div>
                    </div>
                    <div>
                      <span className="step-icon muted">3</span>
                      <div>
                        <strong>Your decision</strong>
                        <small>Review, revise, or escalate</small>
                      </div>
                    </div>
                  </div>
                  {analysis && (
                    <div className="result" role="status">
                      <span>RISK SIGNAL</span>
                      <strong>
                        {analysis.risk ?? "—"}
                        <small>
                          {analysis.risk === null ? "unscored" : "/100"}
                        </small>
                      </strong>
                      <div className="risk-track">
                        <i style={{ width: `${analysis.risk ?? 0}%` }} />
                      </div>
                      <small>
                        {analysis.reason.replaceAll("_", " ")} ·{" "}
                        {analysis.source}
                      </small>
                      {analysis.status !== "blocked" && (
                        <button className="primary" onClick={send}>
                          {analysis.status === "warning"
                            ? "Override warning & send"
                            : analysis.status === "unavailable"
                              ? "Send without contextual analysis"
                              : "Send message"}
                          <ArrowUpRight size={15} />
                        </button>
                      )}
                    </div>
                  )}
                  <button
                    className="primary"
                    disabled={
                      !session.draft.trim() ||
                      status === "checking" ||
                      session.messages.length >= 200
                    }
                    onClick={check}
                  >
                    {status === "checking" ? "Checking…" : "Check this message"}
                    <ArrowUpRight size={16} />
                  </button>
                  <button className="text-button" onClick={escalate}>
                    Escalate for review <ArrowUpRight size={14} />
                  </button>
                  <div className="privacy-note">
                    <EyeOff size={16} />
                    <span>
                      Conversation content stays out of the security dashboard.
                    </span>
                  </div>
                </section>
              </div>
              <div className="bottom-note">
                <ShieldCheck size={15} />
                <span>Built for the moments before “send.”</span>
                <span>Explore safely. Every scenario is fictional.</span>
              </div>
            </>
          ) : view === "Security dashboard" ? (
            <Dashboard
              incidents={session.incidents}
              onReview={(id, disposition) =>
                update((previous) => ({
                  incidents: previous.incidents.map((incident) =>
                    incident.id === id
                      ? { ...incident, disposition }
                      : incident,
                  ),
                }))
              }
            />
          ) : view === "Rules & policies" ? (
            <>
              <section className="card policy-publication">
                <div>
                  <span className="eyebrow">PUBLISHED POLICY</span>
                  <h2>Policy v{session.policy.version}</h2>
                  <p>
                    Published locally{" "}
                    {new Date(session.policy.publishedAt).toLocaleString()}
                    {session.policy.restoredFrom
                      ? ` · restored from v${session.policy.restoredFrom}`
                      : ""}
                    . The Simulator uses this published revision.
                  </p>
                  <span className="policy-state">
                    {policyDirty
                      ? "Unpublished draft changes"
                      : "Draft matches published revision"}
                  </span>
                </div>
                <div className="policy-actions">
                  <button
                    className="primary"
                    disabled={!policyDirty}
                    onClick={publish}
                  >
                    Publish policy v{session.policy.version + 1}
                  </button>
                  <button
                    className="secondary"
                    disabled={!session.previousPolicy}
                    onClick={restore}
                  >
                    {session.previousPolicy
                      ? `Restore v${session.previousPolicy.version} as v${session.policy.version + 1}`
                      : "No previous revision yet"}
                  </button>
                  <button
                    className="text-button"
                    disabled={!policyDirty}
                    onClick={() => {
                      update({
                        draftRules: session.policy.rules.map((rule) => ({
                          ...rule,
                        })),
                      });
                      setPreviewResult("");
                    }}
                  >
                    Discard draft changes
                  </button>
                </div>
                {session.previousPolicy && (
                  <details className="previous-policy">
                    <summary>
                      Inspect previous published revision v
                      {session.previousPolicy.version}
                    </summary>
                    <ul>
                      {session.previousPolicy.rules.map((rule) => (
                        <li key={rule.id}>
                          <code>{rule.literal}</code> · {rule.action} ·{" "}
                          {rule.enabled ? "enabled" : "disabled"}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </section>
              <div className="rules-grid">
                <section className="card">
                  <h2>Edit draft rules</h2>
                  <p>
                    Case-insensitive literal rules can warn or block. Additions
                    and toggles are staged until you publish. Built-in
                    TL-DEMO-SECRET and THREATLOCK DEMO: RESTRICTED markers
                    always block.
                  </p>
                  {session.draftRules.map((rule) => (
                    <div className="rule" key={rule.id}>
                      <div>
                        <strong>{rule.name}</strong>
                        <code>{rule.literal}</code>
                        <small>Action: {rule.action}</small>
                      </div>
                      <button
                        role="switch"
                        aria-checked={rule.enabled}
                        aria-label={`Enable ${rule.name}`}
                        className={`toggle ${rule.enabled ? "on" : ""}`}
                        onClick={() => {
                          update({
                            draftRules: session.draftRules.map((item) =>
                              item.id === rule.id
                                ? { ...item, enabled: !item.enabled }
                                : item,
                            ),
                          });
                          setPreviewResult("");
                        }}
                      >
                        <span />
                      </button>
                    </div>
                  ))}
                  <form
                    onSubmit={(event) => {
                      event.preventDefault();
                      const error = validateLiteral(
                        literal,
                        session.draftRules,
                      );
                      if (error) {
                        setRuleError(error);
                        return;
                      }
                      update({
                        draftRules: [
                          ...session.draftRules,
                          {
                            id: crypto.randomUUID(),
                            name: "Custom restricted phrase",
                            literal: literal.trim(),
                            enabled: true,
                            action,
                          },
                        ],
                      });
                      setLiteral("");
                      setRuleError("");
                      setPreviewResult("");
                    }}
                  >
                    <label htmlFor="literal">Add a restricted phrase</label>
                    <input
                      id="literal"
                      value={literal}
                      maxLength={120}
                      onChange={(event) => setLiteral(event.target.value)}
                      placeholder="A fictional phrase to protect"
                    />
                    <label htmlFor="rule-action">Action</label>
                    <select
                      id="rule-action"
                      value={action}
                      onChange={(event) =>
                        setAction(event.target.value as "warn" | "block")
                      }
                    >
                      <option value="block">Block sharing</option>
                      <option value="warn">Warn before sharing</option>
                    </select>
                    <small>Up to 50 rules · 120 characters each</small>
                    {ruleError && <p role="alert">{ruleError}</p>}
                    <button className="primary">Add to draft</button>
                  </form>
                </section>
                <section className="card">
                  <h2>Preview draft policy</h2>
                  <p>
                    This preview checks unpublished draft rules without
                    publishing them or creating an incident. Live AI is not
                    connected.
                  </p>
                  <textarea
                    aria-label="Policy preview draft"
                    value={preview}
                    maxLength={2000}
                    onChange={(event) => {
                      setPreview(event.target.value);
                      setPreviewResult("");
                    }}
                  />
                  <button
                    className="primary"
                    onClick={() => {
                      const result = evaluateLocal(
                        { text: preview },
                        session.draftRules,
                      );
                      setPreviewResult(
                        result?.status === "blocked"
                          ? "Blocked by draft policy."
                          : result?.status === "warning"
                            ? "Warning from draft policy."
                            : "Draft policy passed.",
                      );
                    }}
                  >
                    Run preview
                  </button>
                  <p role="status">{previewResult}</p>
                  <div className="demo-banner">
                    <Info size={18} />
                    <span>
                      Six synthetic PNG/JPEG/single-page PDF samples are bundled
                      locally. Preview a selected sample in the composer. No
                      upload or OCR is connected.
                    </span>
                  </div>
                </section>
              </div>
            </>
          ) : (
            <>
              <div className="how-grid">
                {[
                  [
                    "01",
                    "Local policy first",
                    "Enabled literal rules warn or block, and classified restricted attachments produce a deterministic block. A blocked draft cannot be overridden.",
                  ],
                  [
                    "02",
                    "Context before confidence",
                    "Exact curated scenarios show recorded contextual results. Arbitrary drafts receive only local policy checks and an explicit live-AI-unavailable status.",
                  ],
                  [
                    "03",
                    "Human judgment stays central",
                    "Contextual warnings are overridable. Any conversation can be escalated, and dashboard review retains metadata only.",
                  ],
                ].map(([number, title, text]) => (
                  <section className="card" key={number}>
                    <span className="how-num">{number}</span>
                    <h2>{title}</h2>
                    <p>{text}</p>
                  </section>
                ))}
              </div>
              <section className="card">
                <h2>Development boundaries</h2>
                <p>
                  This prototype uses sessionStorage in this browser tab. Drafts
                  and fictional chat messages persist locally until the tab
                  session ends. Nothing is sent to AWS or an external AI
                  provider. There is no authentication in local development.
                </p>
                <p>
                  Each conversation supports 200 messages and drafts of 2,000
                  characters. The future cloud adapter contract bounds context
                  to 20 messages and 16,000 characters. A recorded result is
                  valid only for its exact original draft, incoming context, and
                  attachment. Use Next message to reveal each scenario step.
                </p>
                <p>
                  Future AWS integration is not connected. A production adapter
                  must report outages explicitly and must never fall back
                  silently to demo fixtures.
                </p>
                <button
                  className="text-button"
                  onClick={() => {
                    revision.current++;
                    sessionStorage.removeItem(STORAGE_KEY);
                    sessionStorage.removeItem("threatlock:v2");
                    setSession(fresh());
                    setAnalysis(undefined);
                    setStatus("editing");
                    setNotice("Local session reset.");
                  }}
                >
                  Reset this local demo
                </button>
              </section>
            </>
          )}
          {notice && (
            <div className="notice" role="status">
              {notice}
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                ×
              </button>
            </div>
          )}
          <footer>
            <span>THREATLOCK</span>
            <span>Human judgment. Stronger boundaries.</span>
            <span>LOCAL DEVELOPMENT · v0.1</span>
          </footer>
        </main>
      </div>
    </div>
  );
}
