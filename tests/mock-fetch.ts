import { appendFileSync } from "node:fs";

interface MockResponse {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
}

const logPath = process.env.MOCK_FETCH_LOG;
const queue = JSON.parse(process.env.MOCK_FETCH_QUEUE || "[]") as MockResponse[];

globalThis.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
  const url = typeof input === "string" || input instanceof URL ? String(input) : input.url;
  const headers: Record<string, string> = {};
  new Headers(init.headers).forEach((value, key) => {
    headers[key] = value;
  });

  appendFileSync(
    logPath || "/dev/null",
    `${JSON.stringify({
      url,
      method: init.method || "GET",
      headers,
      body: await serializeBody(init.body)
    })}\n`
  );

  const next = queue.shift() || { status: 200, body: {} };
  const status = next.status || 200;
  const body = status === 204 ? null : JSON.stringify(next.body ?? {});
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/json",
      ...(next.headers || {})
    }
  });
};

async function serializeBody(body: BodyInit | null | undefined): Promise<unknown> {
  if (!body) return null;
  if (typeof body === "string") return body;
  if (body instanceof FormData) {
    const result: Record<string, unknown> = {};
    for (const [key, value] of body.entries()) {
      result[key] =
        typeof value === "string"
          ? value
          : { name: value.name, type: value.type, size: value.size, text: await value.text() };
    }
    return result;
  }
  return String(body);
}
