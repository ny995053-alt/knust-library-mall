import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";

// The application helper is TypeScript while the contract suite runs on Node
// 20 without a TypeScript loader. Compile this one dependency-free module in
// memory so these are behavior tests against the real production source.
const source = readFileSync(new URL("../lib/request-origin.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.ESNext,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
const helper = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`);
const { getRequestOrigins, isSameOriginRequest, resolveRequestOrigin } = helper;

test("accepts the exact Next/ngrok proxy origin without grafting internal port 3000", () => {
  const request = new Request("https://0.0.0.0:3000/api/auth/sign-in", {
    method: "POST",
    headers: {
      origin: "https://demo-123.ngrok-free.app",
      host: "demo-123.ngrok-free.app",
      "x-forwarded-proto": "https",
      "x-forwarded-host": "demo-123.ngrok-free.app",
      "x-forwarded-port": "3000",
    },
  });

  assert.equal(isSameOriginRequest(request), true);
  assert.deepEqual(getRequestOrigins(request), [
    "https://demo-123.ngrok-free.app",
    "https://0.0.0.0:3000",
  ]);
  assert.equal(resolveRequestOrigin(request), "https://demo-123.ngrok-free.app");
});

test("rejects unrelated cross-origin requests", () => {
  const request = new Request("http://127.0.0.1:3000/api/auth/sign-in", {
    method: "POST",
    headers: {
      origin: "https://evil.example",
      host: "demo-123.ngrok-free.app",
      "x-forwarded-proto": "https",
      "x-forwarded-host": "demo-123.ngrok-free.app",
    },
  });

  assert.equal(isSameOriginRequest(request), false);
});

test("does not trust forwarding headers whose authority disagrees with Host", () => {
  const request = new Request("http://127.0.0.1:3000/api/auth/sign-in", {
    method: "POST",
    headers: {
      origin: "https://evil.example",
      host: "library.example",
      "x-forwarded-proto": "https",
      "x-forwarded-host": "evil.example",
    },
  });

  assert.equal(isSameOriginRequest(request), false);
  assert.equal(resolveRequestOrigin(request), "http://library.example");
});

test("accepts a normal localhost request", () => {
  const request = new Request("http://localhost:3000/api/auth/sign-in", {
    method: "POST",
    headers: {
      origin: "http://localhost:3000",
      host: "localhost:3000",
    },
  });

  assert.equal(isSameOriginRequest(request), true);
  assert.equal(resolveRequestOrigin(request), "http://localhost:3000");
});

test("rejects an explicit cross-site browser request without Origin", () => {
  const request = new Request("https://library.example/api/auth/sign-in", {
    method: "POST",
    headers: {
      host: "library.example",
      "sec-fetch-site": "cross-site",
    },
  });

  assert.equal(isSameOriginRequest(request), false);
});
