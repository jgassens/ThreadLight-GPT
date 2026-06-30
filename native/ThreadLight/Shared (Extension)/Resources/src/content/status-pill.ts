import { THREADLIGHT_STATUS_PILL_ID } from "../shared/constants";
import type { ThreadLightStatusEventDetail } from "../shared/types";

const STYLE_ID = "threadlight-status-pill-style";
const IDLE_CLASS = "threadlight-status-pill-idle";
// After this long without the text changing, dim the pill so it stops drawing the eye.
const IDLE_FADE_MS = 6000;

let idleHandle: number | undefined;
let lastText = "";

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
#${THREADLIGHT_STATUS_PILL_ID} {
  position: fixed;
  z-index: 2147483646;
  right: 14px;
  bottom: 92px;
  max-width: min(260px, calc(100vw - 28px));
  padding: 6px 10px;
  border-radius: 9px;
  border: 1px solid rgba(0, 0, 0, 0.10);
  background: rgba(250, 250, 250, 0.92);
  color: #374151;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.10);
  font: 11.5px/1.35 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  /* Purely informational: never intercept clicks on the composer underneath. */
  pointer-events: none;
  opacity: 0.95;
  transition: opacity 0.45s ease;
}
#${THREADLIGHT_STATUS_PILL_ID}.${IDLE_CLASS} {
  opacity: 0.2;
}
@media (prefers-color-scheme: dark) {
  #${THREADLIGHT_STATUS_PILL_ID} {
    border-color: rgba(255, 255, 255, 0.12);
    background: rgba(28, 28, 30, 0.9);
    color: #e5e7eb;
  }
}`;
  document.documentElement.append(style);
}

function formatStatus(detail: ThreadLightStatusEventDetail): string {
  if (detail.state === "trimmed" && detail.totalVisibleTurns !== undefined && detail.keptVisibleTurns !== undefined) {
    return `ThreadLight: showing ${detail.keptVisibleTurns} of ${detail.totalVisibleTurns} turns. Reload to restore full thread.`;
  }

  if (detail.state === "unrecognized") {
    return "ThreadLight could not recognize this ChatGPT page version.";
  }

  if (detail.state === "paused") {
    return "ThreadLight paused for this reload.";
  }

  if (detail.state === "disabled") {
    return "ThreadLight disabled.";
  }

  return "ThreadLight running.";
}

function getOrCreatePill(): HTMLElement {
  const existing = document.getElementById(THREADLIGHT_STATUS_PILL_ID);
  if (existing) {
    return existing;
  }

  ensureStyles();
  const pill = document.createElement("aside");
  pill.id = THREADLIGHT_STATUS_PILL_ID;
  pill.setAttribute("role", "status");
  pill.setAttribute("aria-live", "polite");
  document.documentElement.append(pill);
  return pill;
}

function scheduleIdleFade(pill: HTMLElement): void {
  if (idleHandle !== undefined) {
    window.clearTimeout(idleHandle);
  }
  idleHandle = window.setTimeout(() => {
    idleHandle = undefined;
    pill.classList.add(IDLE_CLASS);
  }, IDLE_FADE_MS);
}

export function removeStatusPill(): void {
  if (idleHandle !== undefined) {
    window.clearTimeout(idleHandle);
    idleHandle = undefined;
  }
  lastText = "";
  document.getElementById(THREADLIGHT_STATUS_PILL_ID)?.remove();
}

export function updateStatusPill(detail: ThreadLightStatusEventDetail, show: boolean): void {
  if (!show) {
    removeStatusPill();
    return;
  }

  const text = formatStatus(detail);
  const pill = getOrCreatePill();

  // Only re-brighten when the message actually changes; otherwise leave it calm
  // (e.g. while the user scrolls and counts are recomputed to the same value).
  if (text === lastText && pill.textContent === text) {
    return;
  }

  lastText = text;
  pill.textContent = text;
  pill.classList.remove(IDLE_CLASS);
  scheduleIdleFade(pill);
}
