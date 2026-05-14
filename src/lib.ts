export type Visibility = "team" | "public-allowed" | "private-strict";

export interface ProjectCoordinate {
  host: string;
  owner: string;
  repo: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function normalizeModuleRoot(moduleRoot = ""): string {
  return moduleRoot.replace(/^\/+|\/+$/g, "");
}

export function deriveDisplayPath(sourcePath: string, moduleRoot = ""): string {
  const normalizedSource = sourcePath.replace(/^\/+/, "");
  const normalizedRoot = normalizeModuleRoot(moduleRoot);
  if (!normalizedRoot) return normalizedSource;
  const prefix = `${normalizedRoot}/`;
  if (!normalizedSource.startsWith(prefix)) {
    throw new Error("file_not_in_module_root");
  }
  return normalizedSource.slice(prefix.length);
}

export function assertDisplayPath(path: string): void {
  if (!path.endsWith(".html")) {
    throw new Error("invalid_file_type");
  }
  const segments = path.split("/").filter(Boolean);
  if (segments.length === 0) {
    throw new Error("invalid_path");
  }
  if (segments.some((segment) => segment === "." || segment === "..")) {
    throw new Error("invalid_path");
  }
  if (segments.length > 3) {
    throw new Error(`path_too_deep: max 3 segments including filename, got ${segments.length}`);
  }
}

export function parseRemoteUrl(remoteUrl: string): ProjectCoordinate {
  const trimmed = remoteUrl.trim();
  const scpLike = trimmed.match(/^git@([^:]+):(.+)$/);
  if (scpLike) {
    return splitOwnerRepo(scpLike[1], scpLike[2]);
  }

  const parsed = new URL(trimmed);
  const path = parsed.pathname.replace(/^\/+/, "");
  return splitOwnerRepo(parsed.hostname, path);
}

function splitOwnerRepo(host: string, rawPath: string): ProjectCoordinate {
  const parts = rawPath.replace(/\.git$/, "").split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new Error("invalid_remote_url");
  }
  const repo = parts.pop();
  if (!repo) throw new Error("invalid_remote_url");
  return { host: host.toLowerCase(), owner: parts.join("/"), repo };
}

export function r2Key(project: ProjectCoordinate, path: string): string {
  return `${project.host}/${project.owner}/${project.repo}/${path}`;
}

export function extractTitle(html: string, fallback: string): string {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return fallback;
  return decodeHtml(match[1]).replace(/\s+/g, " ").trim() || fallback;
}

export function extractBodyText(html: string): string {
  return decodeHtml(
    html
      .replace(/<head[\s\S]*?<\/head>/gi, " ")
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

export function decodeHtml(value: string): string {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

export async function sha256Hex(value: string | ArrayBuffer): Promise<string> {
  const input = typeof value === "string" ? encoder.encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", input);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function randomToken(byteLength = 16): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export function isAllowedLocalCallback(value: string | null | undefined): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:") return false;
    if (!["127.0.0.1", "localhost"].includes(url.hostname)) return false;
    if (url.pathname !== "/save") return false;
    const port = Number(url.port);
    return Number.isInteger(port) && port >= 1024 && port <= 65535;
  } catch {
    return false;
  }
}

export async function hashToken(token: string): Promise<string> {
  return sha256Hex(token);
}

export interface ViewTokenPayload {
  doc_id: number;
  user_id?: number;
  exp: number;
  nonce: string;
}

export async function signViewToken(payload: ViewTokenPayload, secret: string): Promise<string> {
  const body = base64UrlEncode(encoder.encode(JSON.stringify(payload)));
  const signature = await hmac(body, secret);
  return `${body}.${signature}`;
}

export async function verifyViewToken(token: string, secret: string, now = unixNow()): Promise<ViewTokenPayload | null> {
  const [body, signature] = token.split(".");
  if (!body || !signature) return null;
  const expected = await hmac(body, secret);
  if (!constantTimeEqual(signature, expected)) return null;
  const payload = JSON.parse(decoder.decode(base64UrlDecode(body))) as ViewTokenPayload;
  return payload.exp >= now ? payload : null;
}

export function unixNow(): number {
  return Math.floor(Date.now() / 1000);
}

async function hmac(body: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign"
  ]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  return base64UrlEncode(new Uint8Array(signature));
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function base64UrlDecode(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
