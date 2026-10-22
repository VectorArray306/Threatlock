import {
  assessment,
  object,
  type CheckRequest,
  type CloudIncident,
  type Policy,
} from "./cloud-contract";
export interface CloudConfig {
  api: string;
  domain: string;
  clientId: string;
  redirect: string;
}
export function cloudConfig(
  env: Record<string, string | undefined>,
): CloudConfig {
  const config = {
    api: env.VITE_API_URL ?? "",
    domain: env.VITE_COGNITO_DOMAIN ?? "",
    clientId: env.VITE_COGNITO_CLIENT_ID ?? "",
    redirect: location.origin,
  };
  for (const url of [config.api, config.domain])
    if (new URL(url).protocol !== "https:")
      throw Error("Cloud endpoints must use HTTPS");
  if (!config.clientId) throw Error("Cognito client ID is required");
  return config;
}
const base64 = (data: Uint8Array) =>
  btoa(String.fromCharCode(...data))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
export async function signIn(config: CloudConfig) {
  const verifier = base64(crypto.getRandomValues(new Uint8Array(32)));
  const state = base64(crypto.getRandomValues(new Uint8Array(32)));
  sessionStorage.setItem(
    "threatlock.pkce",
    JSON.stringify({ verifier, state }),
  );
  const challenge = base64(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)),
    ),
  );
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    scope: "openid",
    redirect_uri: config.redirect,
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  location.assign(`${config.domain}/oauth2/authorize?${params}`);
}
export async function completeSignIn(
  config: CloudConfig,
): Promise<string | undefined> {
  const params = new URLSearchParams(location.search);
  const code = params.get("code");
  if (!code) return;
  const saved = JSON.parse(sessionStorage.getItem("threatlock.pkce") ?? "null");
  sessionStorage.removeItem("threatlock.pkce");
  history.replaceState(null, "", location.pathname);
  if (!saved || params.get("state") !== saved.state)
    throw Error("Invalid sign-in state");
  const response = await fetch(`${config.domain}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: config.clientId,
      redirect_uri: config.redirect,
      code,
      code_verifier: saved.verifier,
    }),
  });
  if (!response.ok) throw Error("Sign-in failed");
  const value = object(await response.json());
  if (typeof value.id_token !== "string") throw Error("Missing identity token");
  return value.id_token;
}
export function cloudAdapter(config: CloudConfig, token: () => string) {
  async function call(path: string, method = "GET", body?: unknown) {
    const response = await fetch(config.api + path, {
      method,
      headers: {
        Authorization: `Bearer ${token()}`,
        "Content-Type": "application/json",
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok)
      throw Error(
        response.status === 401
          ? "Session expired; sign in again."
          : `Cloud request failed (${response.status}).`,
      );
    return response.json();
  }
  return {
    policy: (): Promise<Policy> => call("/policy"),
    stage: (policy: Policy) => call("/policy/stage", "PUT", policy),
    publish: (version: number): Promise<Policy> =>
      call("/policy/publish", "POST", { version }),
    incidents: (): Promise<CloudIncident[]> => call("/incidents"),
    review: (id: string, disposition: "acknowledged" | "escalated") =>
      call("/incidents", "PATCH", { id, disposition }),
    analyze: async (request: CheckRequest) =>
      assessment(await call("/assessments", "POST", request)),
    upload: async (file: File) => {
      const value = object(await call("/uploads", "POST", { mime: file.type }));
      const form = object(value.form);
      const data = new FormData();
      for (const [key, val] of Object.entries(object(form.fields)))
        data.append(key, String(val));
      data.append("file", file);
      const response = await fetch(String(form.url), {
        method: "POST",
        body: data,
      });
      if (!response.ok) throw Error("Upload failed");
      return String(value.uploadId);
    },
  };
}

export function signOut(config: CloudConfig) {
  location.assign(
    `${config.domain}/logout?${new URLSearchParams({ client_id: config.clientId, logout_uri: config.redirect })}`,
  );
}
