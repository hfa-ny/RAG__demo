import { marked } from "marked";
import DOMPurify from "dompurify";
import type { ChatResponse } from "../shared/types.js";
import "./style.css";

const form = document.querySelector<HTMLFormElement>("#question-form")!;
const input = document.querySelector<HTMLInputElement>("#question")!;
const button = form.querySelector<HTMLButtonElement>("button")!;
const chat = document.querySelector<HTMLElement>("#chat")!;
const status = document.querySelector<HTMLElement>("#status")!;
const error = document.querySelector<HTMLElement>("#error")!;

function message(role: "user" | "assistant", text: string): HTMLElement {
  const article = document.createElement("article");
  article.className = `message ${role}`;
  article.setAttribute("aria-label", role === "user" ? "You" : "Assistant");
  const avatar = document.createElement("span");
  avatar.className = "avatar";
  if (role === "user") avatar.textContent = "👤";
  else {
    avatar.classList.add("star-cluster");
    for (let i = 0; i < 3; i++) {
      const star = document.createElement("span");
      star.textContent = "✦";
      avatar.append(star);
    }
  }
  avatar.setAttribute("aria-hidden", "true");
  const body = document.createElement("div");
  body.className = "message-body";
  if (role === "user") body.textContent = text;
  else body.innerHTML = DOMPurify.sanitize(marked.parse(text, { async: false }), {
    USE_PROFILES: { html: true },
    // Never load model-supplied images or embedded external resources.
    FORBID_TAGS: ["img", "video", "audio", "iframe", "style", "form", "input"],
    FORBID_ATTR: ["style"],
  });
  article.append(avatar, body);
  chat.append(article);
  return body;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const question = input.value.trim();
  if (!question || input.disabled) return;
  chat.replaceChildren(); // Match Streamlit's single-question display.
  message("user", question);
  error.hidden = true;
  status.hidden = false;
  input.disabled = button.disabled = true;
  try {
    const response = await fetch("/api/chat", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }),
    });
    const data = await response.json() as ChatResponse & { error?: string };
    if (!response.ok) throw new Error(data.error || "Unable to answer this question. Please try again.");
    const body = message("assistant", data.answer);
    const sources = document.createElement("details");
    const summary = document.createElement("summary");
    summary.textContent = "View Retrieved Source Documents";
    sources.append(summary);
    for (const doc of data.context) {
      const source = document.createElement("div");
      source.className = "source";
      const sourceMeta = document.createElement("div");
      sourceMeta.className = "source-meta";
      sourceMeta.textContent = [doc.source, doc.section].filter(Boolean).join(" - ");
      if (sourceMeta.textContent) source.append(sourceMeta);
      const sourceText = document.createElement("div");
      sourceText.className = "source-text";
      sourceText.textContent = doc.pageContent;
      source.append(sourceText);
      sources.append(source);
    }
    body.append(sources);
    input.value = "";
  } catch (cause) {
    error.textContent = cause instanceof Error ? cause.message : "Unable to reach the local server. Please try again.";
    error.hidden = false;
  } finally {
    status.hidden = true;
    input.disabled = button.disabled = false;
    input.focus();
  }
});
