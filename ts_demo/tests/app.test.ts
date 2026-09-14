import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createApp } from "../server/app.js";
import { createIndexJob } from "../server/indexJob.js";
import type { IndexJob } from "../server/indexJob.js";
import { DocumentError } from "../server/documents.js";
import { createCorpus, type Corpus } from "../server/corpus.js";
import type { TestContext } from "node:test";

const stubCorpus = (): Corpus => ({
  async list() { return []; },
  async save(name: string) { return name; },
  async remove() {},
});

async function startServer(app: ReturnType<typeof createApp>, t: TestContext) {
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(() => { server.closeAllConnections(); server.close(); });
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}

const idleJob = (): IndexJob => createIndexJob(async () => ({
  added: [], changed: [], removed: [], unchanged: [], chunksAdded: 0, chunksRemoved: 0,
}));

test("chat API validates input, returns sources, and handles an unavailable model", async (t) => {
  const questions: string[] = [];
  const app = createApp({
    index: idleJob(),
    corpus: stubCorpus(),
    ask: async (question) => {
      questions.push(question);
      if (question === "offline") throw new Error("sensitive internal details");
      return { answer: "Local answer", context: [{ pageContent: "Policy text", source: "policy.txt" }] };
    },
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

test("index endpoints run one sync at a time and report progress", async (t) => {
  let release = () => {};
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const index = createIndexJob(async (onProgress) => {
    onProgress(0, 2);
    await gate;
    return { added: ["a.txt", "b.txt"], changed: [], removed: [], unchanged: [], chunksAdded: 5, chunksRemoved: 0 };
  });
  const base = await startServer(createApp({
    index, corpus: stubCorpus(), ask: async () => ({ answer: "", context: [] }),
  }), t);

  assert.equal((await fetch(`${base}/api/index/status`)).status, 200);
  assert.equal((await (await fetch(`${base}/api/index/status`)).json()).state, "idle");

  const started = await fetch(`${base}/api/index/sync`, { method: "POST" });
  assert.equal(started.status, 202);

  // A second request while the first is in flight must not kick off a duplicate run.
  assert.equal((await fetch(`${base}/api/index/sync`, { method: "POST" })).status, 409);

  const running = await (await fetch(`${base}/api/index/status`)).json();
  assert.equal(running.state, "running");
  assert.equal(running.total, 2);

  release();
  await index.settled();
  const finished = await (await fetch(`${base}/api/index/status`)).json();
  assert.equal(finished.state, "idle");
  assert.deepEqual(finished.summary.added, ["a.txt", "b.txt"]);
  assert.equal(finished.summary.chunksAdded, 5);

  // The guard releases once a run settles, so a later sync is accepted.
  assert.equal((await fetch(`${base}/api/index/sync`, { method: "POST" })).status, 202);
});

test("a failed sync names a corpus problem but hides service internals", async () => {
  const corpus = createIndexJob(async () => { throw new DocumentError("Unable to extract text from broken.pdf: bad header"); });
  corpus.start();
  await corpus.settled();
  assert.equal(corpus.status().state, "failed");
  assert.match(String(corpus.status().error), /broken\.pdf/);

  const service = createIndexJob(async () => { throw new Error("ECONNREFUSED 127.0.0.1:11434 internal-token"); });
  service.start();
  await service.settled();
  assert.equal(service.status().state, "failed");
  assert.doesNotMatch(String(service.status().error), /ECONNREFUSED|internal-token/);
});

test("document API uploads, lists and deletes without escaping the corpus folder", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "campus-api-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const indexed = new Map([["ghost.txt", { contentHash: "h", chunks: 3 }]]);
  const corpus = createCorpus(directory, async () => indexed);
  const base = await startServer(createApp({
    corpus, index: idleJob(), ask: async () => ({ answer: "", context: [] }),
  }), t);

  const upload = (name: string, body: string) => fetch(`${base}/api/documents?name=${encodeURIComponent(name)}`, {
    method: "POST", headers: { "Content-Type": "application/octet-stream" }, body,
  });

  const created = await upload("policy.txt", "Local policy text.");
  assert.equal(created.status, 201);
  assert.equal((await created.json()).source, "policy.txt");
  assert.equal(await readFile(path.join(directory, "policy.txt"), "utf8"), "Local policy text.");

  // Traversal, absolute paths and folder components must all be refused, not sanitised into a write.
  for (const name of ["../escape.txt", "../../etc/passwd.txt", "/tmp/absolute.txt", "nested/deep.txt"]) {
    assert.equal((await upload(name, "nope")).status, 400, `expected ${name} to be rejected`);
  }
  assert.equal((await upload("script.exe", "nope")).status, 400);
  assert.equal((await upload("empty.txt", "")).status, 400);
  assert.deepEqual(await readdir(directory), ["policy.txt"]);

  const listed = await (await fetch(`${base}/api/documents`)).json();
  const onDisk = listed.documents.find((doc: { source: string }) => doc.source === "policy.txt");
  assert.deepEqual(onDisk, { source: "policy.txt", format: "txt", chunks: 0, indexed: false, missing: false });
  // A source the index still holds but the folder no longer has is reported as pending removal.
  assert.equal(listed.documents.find((doc: { source: string }) => doc.source === "ghost.txt").missing, true);

  assert.equal((await fetch(`${base}/api/documents?source=${encodeURIComponent("../escape.txt")}`, { method: "DELETE" })).status, 400);
  assert.equal((await fetch(`${base}/api/documents?source=absent.txt`, { method: "DELETE" })).status, 400);
  assert.equal((await fetch(`${base}/api/documents?source=policy.txt`, { method: "DELETE" })).status, 200);
  assert.deepEqual(await readdir(directory), []);
});
