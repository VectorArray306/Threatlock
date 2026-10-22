import { useEffect, useRef, useState } from "react";
import {
  cloudAdapter,
  cloudConfig,
  completeSignIn,
  signIn,
  signOut,
  type CloudConfig,
} from "./cloudAdapter";
import {
  MAX_BYTES,
  MIME_TYPES,
  type Assessment,
  type CloudIncident,
  type Evidence,
  type Policy,
} from "./cloud-contract";
import "./style.css";
export default function CloudApp() {
  const [config, setConfig] = useState<CloudConfig>();
  const [token, setToken] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<number[]>([]);
  const [override, setOverride] = useState(false);
  const [text, setText] = useState("");
  const [context, setContext] = useState("");
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [provenance, setProvenance] = useState("draft");
  const [result, setResult] = useState<Assessment>();
  const [policy, setPolicy] = useState<Policy>({ version: 0, rules: [] });
  const [rules, setRules] = useState("[]");
  const [incidents, setIncidents] = useState<CloudIncident[]>([]);
  const authentication = useRef<Promise<string | undefined>>(undefined);
  useEffect(() => {
    let active = true;
    try {
      const cfg = cloudConfig(import.meta.env);
      setConfig(cfg);
      authentication.current ??= completeSignIn(cfg);
      void authentication.current
        .then((value) => {
          if (active && value) setToken(value);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    } catch (e) {
      setError((e as Error).message);
    }
    return () => {
      active = false;
    };
  }, []);
  const api = config && token ? cloudAdapter(config, () => token) : undefined;
  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!api) return;
    void run(async () => {
      const value = await api.policy();
      setPolicy(value);
      setRules(JSON.stringify(value.rules, null, 2));
      setIncidents(await api.incidents());
    });
  }, [token]);
  return (
    <main className="cloud-presenter">
      <h1>Threatlock · Cloud presenter</h1>
      <p>
        Authenticated demonstration. Cloud records are separate from the local
        synthetic walkthrough. This browser cannot protect real Android apps.
      </p>
      {error && <p role="alert">{error}</p>}
      {!token ? (
        <button
          disabled={!config}
          onClick={() => void run(() => signIn(config!))}
        >
          Sign in with Cognito
        </button>
      ) : (
        <>
          <button
            onClick={() => {
              signOut(config!);
              setToken("");
              setIncidents([]);
              setEvidence([]);
              setText("");
              setContext("");
              setResult(undefined);
              setOverride(false);
            }}
          >
            End presenter session
          </button>
          <section>
            <h2>Conversation assessment</h2>
            <p>
              Choose a fictional input or write your own. Every check uses the
              live API; no recorded result is supplied.
            </p>
            <div className="cloud-presets">
              {[
                {
                  name: "Public event",
                  context: "Is the community meetup still happening on Friday?",
                  draft: "Yes, the public agenda is ready. See you Friday.",
                },
                {
                  name: "Urgent IT request",
                  context:
                    "IT support here. Your account will be locked in ten minutes.\nSend your recovery code here so I can keep you signed in.",
                  draft: "My recovery code is 482019.",
                },
                {
                  name: "Restricted handoff",
                  context: "Can you share the internal roadmap here?",
                  draft: "THREATLOCK DEMO: RESTRICTED — fictional roadmap.",
                },
              ].map((preset) => (
                <button
                  key={preset.name}
                  disabled={busy}
                  onClick={() => {
                    setText(preset.draft);
                    setContext(preset.context);
                    setEvidence([]);
                    setSent([]);
                    setResult(undefined);
                    setOverride(false);
                  }}
                >
                  {preset.name}
                </button>
              ))}
            </div>
            <div
              className="phone"
              style={{ height: 320, margin: "16px 0" }}
              aria-label="Cloud Android conversation"
            >
              <div className="phone-status">
                <strong>Threatlock</strong>
                <span>Cloud presenter</span>
              </div>
              <div className="chat-thread">
                {context
                  .split("\n")
                  .filter(Boolean)
                  .map((message, index) => (
                    <div
                      className={`bubble ${sent.includes(index) ? "outgoing" : ""}`}
                      key={index}
                    >
                      {message}
                    </div>
                  ))}
              </div>
            </div>
            <label>
              Context (one message per line, up to 20)
              <textarea
                disabled={busy || evidence.length > 0}
                value={context}
                onChange={(e) => {
                  setContext(e.target.value);
                  setSent([]);
                  setResult(undefined);
                  setOverride(false);
                }}
                maxLength={16019}
              />
            </label>
            <label>
              Draft
              <textarea
                disabled={busy}
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setResult(undefined);
                  setOverride(false);
                }}
                maxLength={2000}
              />
            </label>
            <label>
              Attachment belongs to
              <select
                value={provenance}
                onChange={(e) => setProvenance(e.target.value)}
              >
                <option value="draft">Draft</option>
                {context
                  .split("\n")
                  .filter(Boolean)
                  .map((_, i) => (
                    <option key={i} value={i}>
                      Context message {i + 1}
                    </option>
                  ))}
              </select>
            </label>
            <input
              aria-label="Upload evidence"
              type="file"
              accept={MIME_TYPES.join(",")}
              disabled={busy || evidence.length >= 4}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                void run(async () => {
                  if (
                    file.size > MAX_BYTES ||
                    !(MIME_TYPES as readonly string[]).includes(file.type)
                  )
                    throw Error(
                      "Choose a PNG, JPEG or single-page PDF under 1 MB.",
                    );
                  const uploadId = await api!.upload(file);
                  setEvidence((old) => [
                    ...old,
                    {
                      uploadId,
                      messageIndex:
                        provenance === "draft" ? "draft" : Number(provenance),
                    },
                  ]);
                  setResult(undefined);
                  setOverride(false);
                });
              }}
            />
            <p>
              Use only fictional or synthetic files. Uploaded bytes are
              transiently processed by AWS services after integration.{" "}
              {evidence.length} temporary attachments. Uploads are consumed by
              one assessment; upload again to recheck. OCR failure blocks
              attachment sharing.
            </p>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const value = await api!.analyze({
                    id: crypto.randomUUID(),
                    text,
                    context: context.split("\n").filter(Boolean),
                    evidence,
                  });
                  setEvidence([]);
                  setResult(value);
                  setOverride(false);
                  setIncidents(await api!.incidents());
                })
              }
            >
              Check conversation
            </button>
            {result && (
              <div role="status">
                <strong>
                  {result.status.toUpperCase()} ·{" "}
                  {result.risk === null ? "Unscored" : `${result.risk}/100`}
                </strong>
                <p>{result.explanation}</p>
                <small>
                  {result.source} · {result.reason}
                </small>
                {(result.status === "warning" ||
                  result.status === "unavailable") && (
                  <label>
                    <input
                      type="checkbox"
                      checked={override}
                      onChange={(e) => setOverride(e.target.checked)}
                    />
                    {result.status === "warning"
                      ? "I reviewed this warning and choose to send."
                      : "I understand this draft is unscored and choose to send."}
                  </label>
                )}
                <button
                  disabled={
                    busy ||
                    result.status === "blocked" ||
                    ((result.status === "warning" ||
                      result.status === "unavailable") &&
                      !override) ||
                    !text.trim()
                  }
                  onClick={() => {
                    setSent((old) => {
                      const count = context.split("\n").filter(Boolean).length;
                      const shift = Math.max(0, count + 1 - 20);
                      return [...old, count]
                        .map((index) => index - shift)
                        .filter((index) => index >= 0);
                    });
                    setContext((old) =>
                      [...old.split("\n").filter(Boolean), text]
                        .slice(-20)
                        .join("\n"),
                    );
                    setText("");
                    setResult(undefined);
                    setOverride(false);
                  }}
                >
                  Send in demonstration
                </button>
              </div>
            )}
          </section>
          <section>
            <h2>Presenter admin · Policy revision {policy.version}</h2>
            <p>
              Rules apply to every authenticated presenter. Stage changes, then
              publish with concurrency protection.
            </p>
            <label>
              Rules JSON
              <textarea
                aria-label="Cloud rules"
                value={rules}
                onChange={(e) => setRules(e.target.value)}
                rows={8}
              />
            </label>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await api!.stage({
                    version: policy.version,
                    rules: JSON.parse(rules),
                  });
                  setError("Rules staged. Publish to activate.");
                })
              }
            >
              Stage rules
            </button>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const value = await api!.publish(policy.version);
                  setPolicy(value);
                  setResult(undefined);
                  setOverride(false);
                  setRules(JSON.stringify(value.rules, null, 2));
                })
              }
            >
              Publish staged rules
            </button>
          </section>
          <section>
            <h2>Cloud incidents</h2>
            <p>
              Latest 100 metadata records for this presenter. Listings are
              eventually consistent; use Refresh after a new check. Message
              bodies and attachments are never stored here.
            </p>
            <button
              disabled={busy}
              onClick={() =>
                void run(async () => setIncidents(await api!.incidents()))
              }
            >
              Refresh
            </button>
            {incidents.map((item) => (
              <article key={item.id}>
                <p>
                  {item.time} · {item.reason} · {item.disposition} · policy{" "}
                  {item.policyVersion}
                </p>
                {(["acknowledged", "escalated"] as const).map((disposition) => (
                  <button
                    key={disposition}
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await api!.review(item.id, disposition);
                        setIncidents(await api!.incidents());
                      })
                    }
                  >
                    {disposition}
                  </button>
                ))}
              </article>
            ))}
          </section>
        </>
      )}
    </main>
  );
}
