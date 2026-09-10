import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createApp } from "../server/app.js";

test("chat API validates input, returns sources, and handles an unavailable model", async (t) => {
  const questions: string[] = [];
  const app = createApp(async (question) => {
    questions.push(question);
    if (question === "offline") throw new Error("sensitive internal details");
    return { answer: "Local answer", context: [{ pageContent: "Policy text", source: "policy.txt" }] };
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => { server.closeAllConnections(); server.close(); });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}/api/chat`;
  const post = (body: unknown) => fetch(url, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  for (const body of [{}, { question: " " }, { question: 12 }, { question: "x".repeat(10001) }]) {
    assert.equal((await post(body)).status, 400);
  }
  assert.equal(questions.length, 0);
  const success = await post({ question: "  What is the policy?  " });
  assert.equal(success.status, 200);
  assert.equal(success.headers.get("cache-control"), "no-store");
  assert.deepEqual(await success.json(), { answer: "Local answer", context: [{ pageContent: "Policy text", source: "policy.txt" }] });
  assert.equal(questions[0], "What is the policy?");
  const unavailable = await post({ question: "offline" });
  assert.equal(unavailable.status, 503);
  assert.doesNotMatch(await unavailable.text(), /sensitive internal details/);
  const invalidJson = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" });
  assert.equal(invalidJson.status, 400);
  assert.equal((await post({ question: "x".repeat(70000) })).status, 413);
});
