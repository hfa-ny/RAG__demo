import type { DocumentSummary, IndexStatus, RetrievalSettings } from "../shared/types.js";

const panel = document.querySelector<HTMLDetailsElement>("#console")!;
const documentList = document.querySelector<HTMLUListElement>("#documents")!;
const indexState = document.querySelector<HTMLElement>("#index-state")!;
const corpusError = document.querySelector<HTMLElement>("#corpus-error")!;
const uploadInput = document.querySelector<HTMLInputElement>("#upload")!;
const syncButton = document.querySelector<HTMLButtonElement>("#sync")!;
const topK = document.querySelector<HTMLInputElement>("#top-k")!;
const topKValue = document.querySelector<HTMLOutputElement>("#top-k-value")!;
const minSimilarity = document.querySelector<HTMLInputElement>("#min-similarity")!;
const minSimilarityValue = document.querySelector<HTMLOutputElement>("#min-similarity-value")!;

let polling: number | undefined;

function showError(cause: unknown) {
  corpusError.textContent = cause instanceof Error ? cause.message : "Something went wrong. Please try again.";
  corpusError.hidden = false;
}

async function send(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "The server rejected that request.");
  return data;
}

function renderDocuments(documents: DocumentSummary[]) {
  documentList.replaceChildren();
  if (!documents.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "No documents yet. Add one to build the index.";
    documentList.append(empty);
    return;
  }
  for (const entry of documents) {
    const item = document.createElement("li");
    const name = document.createElement("span");
    name.className = "doc-name";
    name.textContent = entry.source;
    const state = document.createElement("span");
    state.className = "doc-state";
    if (entry.missing) state.textContent = "removed from folder - sync to clear";
    else if (entry.indexed) state.textContent = `${entry.chunks} chunk${entry.chunks === 1 ? "" : "s"}`;
    else state.textContent = "not indexed yet - sync to add";
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "doc-remove";
    remove.textContent = "Remove";
    remove.disabled = entry.missing;
    remove.setAttribute("aria-label", `Remove ${entry.source}`);
    remove.addEventListener("click", async () => {
      corpusError.hidden = true;
      remove.disabled = true;
      try {
        await send(`/api/documents?source=${encodeURIComponent(entry.source)}`, { method: "DELETE" });
        await refresh();
        watchIndex();
      } catch (cause) {
        showError(cause);
        remove.disabled = false;
      }
    });
    item.append(name, state, remove);
    documentList.append(item);
  }
}

function renderStatus(status: IndexStatus) {
  syncButton.disabled = status.state === "running";
  if (status.state === "running") {
    indexState.textContent = status.total
      ? `Indexing ${status.completed} of ${status.total} files...`
      : "Checking the corpus for changes...";
    return;
  }
  if (status.state === "failed") {
    indexState.textContent = `Indexing failed: ${status.error ?? "unknown error"}`;
    return;
  }
  const summary = status.summary;
  if (!summary) {
    indexState.textContent = "Idle.";
    return;
  }
  const changes = [
    summary.added.length && `${summary.added.length} added`,
    summary.changed.length && `${summary.changed.length} updated`,
    summary.removed.length && `${summary.removed.length} removed`,
  ].filter(Boolean).join(", ");
  indexState.textContent = changes
    ? `Last sync: ${changes}. ${summary.unchanged.length} unchanged, ${summary.chunksAdded} chunks embedded.`
    : `Last sync: nothing changed. ${summary.unchanged.length} file${summary.unchanged.length === 1 ? "" : "s"} already current.`;
}

async function refresh() {
  // Job status does not depend on the vector store, so report it even when the document list cannot load.
  const status = await send("/api/index/status") as IndexStatus;
  renderStatus(status);
  try {
    const { documents } = await send("/api/documents") as { documents: DocumentSummary[] };
    renderDocuments(documents);
  } catch (cause) {
    showError(cause);
  }
  return status;
}

// Indexing runs in the background, so follow it until it settles rather than blocking on the request.
function watchIndex() {
  if (polling) return;
  polling = window.setInterval(async () => {
    try {
      const status = await refresh();
      if (status.state !== "running") {
        window.clearInterval(polling);
        polling = undefined;
      }
    } catch (cause) {
      window.clearInterval(polling);
      polling = undefined;
      showError(cause);
    }
  }, 1000);
}

uploadInput.addEventListener("change", async () => {
  const file = uploadInput.files?.[0];
  if (!file) return;
  corpusError.hidden = true;
  uploadInput.disabled = true;
  try {
    await send(`/api/documents?name=${encodeURIComponent(file.name)}`, {
      method: "POST", headers: { "Content-Type": "application/octet-stream" }, body: file,
    });
    uploadInput.value = "";
    await refresh();
    watchIndex();
  } catch (cause) {
    showError(cause);
  } finally {
    uploadInput.disabled = false;
  }
});

syncButton.addEventListener("click", async () => {
  corpusError.hidden = true;
  syncButton.disabled = true;
  try {
    await send("/api/index/sync", { method: "POST" });
    watchIndex();
  } catch (cause) {
    showError(cause);
    syncButton.disabled = false;
  }
});

function showSettings(settings: RetrievalSettings) {
  topK.value = String(settings.topK);
  topKValue.textContent = String(settings.topK);
  minSimilarity.value = String(settings.minSimilarity);
  minSimilarityValue.textContent = settings.minSimilarity.toFixed(2);
}

async function saveSettings() {
  try {
    showSettings(await send("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topK: Number(topK.value), minSimilarity: Number(minSimilarity.value) }),
    }) as RetrievalSettings);
  } catch (cause) {
    showError(cause);
  }
}

for (const control of [topK, minSimilarity]) {
  // Update the readout while dragging, but only write the change once the control settles.
  control.addEventListener("input", () => {
    topKValue.textContent = topK.value;
    minSimilarityValue.textContent = Number(minSimilarity.value).toFixed(2);
  });
  control.addEventListener("change", saveSettings);
}

// Load the panel's state the first time it is opened, so the chat is not held up by it.
panel.addEventListener("toggle", async () => {
  if (!panel.open) return;
  corpusError.hidden = true;
  try {
    showSettings(await send("/api/settings") as RetrievalSettings);
    const status = await refresh();
    if (status.state === "running") watchIndex();
  } catch (cause) {
    showError(cause);
  }
}, { once: false });
