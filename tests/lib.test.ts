import { describe, expect, test } from "bun:test";
import {
  assertDisplayPath,
  deriveDisplayPath,
  extractBodyText,
  extractTitle,
  isAllowedLocalCallback,
  parseRemoteUrl,
  r2Key,
  signViewToken,
  verifyViewToken
} from "../src/lib";

describe("path display rules", () => {
  test("checks depth after module_root is removed", () => {
    const display = deriveDisplayPath("docs/auth/oauth/lark.html", "docs");
    expect(display).toBe("auth/oauth/lark.html");
    expect(() => assertDisplayPath(display)).not.toThrow();
  });

  test("rejects four display segments", () => {
    expect(() => assertDisplayPath("auth/oauth/lark/v2.html")).toThrow("path_too_deep");
  });
});

describe("remote parsing", () => {
  test("parses ssh scp-like remotes", () => {
    expect(parseRemoteUrl("git@github.com:leeguoo/cherry.git")).toEqual({
      host: "github.com",
      owner: "leeguoo",
      repo: "cherry"
    });
  });

  test("parses nested ssh url owners", () => {
    expect(parseRemoteUrl("ssh://git@gitlab.internal:2222/team/sub/repo.git")).toEqual({
      host: "gitlab.internal",
      owner: "team/sub",
      repo: "repo"
    });
  });
});

describe("html extraction", () => {
  test("extracts title and body text", () => {
    const html = "<html><head><title>A &amp; B</title><style>.x{}</style></head><body><h1>Hello</h1><script>x()</script>world</body></html>";
    expect(extractTitle(html, "fallback")).toBe("A & B");
    expect(extractBodyText(html)).toBe("Hello world");
  });
});

describe("tokens", () => {
  test("signs and verifies view tokens", async () => {
    const token = await signViewToken({ doc_id: 1, exp: 200, nonce: "abc" }, "secret");
    await expect(verifyViewToken(token, "secret", 100)).resolves.toMatchObject({ doc_id: 1 });
    await expect(verifyViewToken(token, "secret", 201)).resolves.toBeNull();
  });
});

describe("cli callback safety", () => {
  test("allows loopback save callbacks only", () => {
    expect(isAllowedLocalCallback("http://127.0.0.1:49152/save")).toBe(true);
    expect(isAllowedLocalCallback("http://localhost:49152/save")).toBe(true);
    expect(isAllowedLocalCallback("https://127.0.0.1:49152/save")).toBe(false);
    expect(isAllowedLocalCallback("http://127.0.0.1:80/save")).toBe(false);
    expect(isAllowedLocalCallback("http://evil.test:49152/save")).toBe(false);
    expect(isAllowedLocalCallback("http://127.0.0.1:49152/other")).toBe(false);
  });
});

describe("storage keys", () => {
  test("builds r2 key from project and display path", () => {
    expect(r2Key({ host: "github.com", owner: "leeguoo", repo: "cherry" }, "auth/login.html")).toBe(
      "github.com/leeguoo/cherry/auth/login.html"
    );
  });
});
