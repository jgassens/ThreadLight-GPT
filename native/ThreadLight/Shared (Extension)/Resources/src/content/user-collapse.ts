import {
  THREADLIGHT_COLLAPSE_CLASS,
  THREADLIGHT_LONG_USER_COLLAPSED_CLASS,
  THREADLIGHT_LONG_USER_EXPANDED_CLASS,
  THREADLIGHT_LONG_USER_THRESHOLD
} from "../shared/constants";
import {
  CHATGPT_MESSAGE_SELECTOR,
  CHATGPT_USER_MESSAGE_SELECTOR,
  mainScope
} from "./dom-selectors";

const STYLE_ID = "threadlight-user-collapse-style";
const EXPAND_BUTTON_CLASS = "threadlight-expand-user-message";

let processed = new WeakSet<Element>();
let observer: MutationObserver | undefined;
let debounceHandle: number | undefined;
// Which messages to collapse: user-only (the popup toggle) or every role (ultra lean).
let targetSelector = CHATGPT_USER_MESSAGE_SELECTOR;

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
html.${THREADLIGHT_COLLAPSE_CLASS} .${THREADLIGHT_LONG_USER_COLLAPSED_CLASS}:not(.${THREADLIGHT_LONG_USER_EXPANDED_CLASS}) {
  max-height: 320px;
  overflow: hidden;
  position: relative;
}
html.${THREADLIGHT_COLLAPSE_CLASS} .${EXPAND_BUTTON_CLASS} {
  display: inline-flex;
  align-items: center;
  min-height: 30px;
  margin-top: 8px;
  border: 1px solid rgba(127, 127, 127, 0.35);
  border-radius: 8px;
  padding: 4px 9px;
  background: Canvas;
  color: CanvasText;
  font: 12px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  cursor: pointer;
}`;
  document.documentElement.append(style);
}

function findMessageRoot(element: Element): HTMLElement | undefined {
  const htmlElement = element instanceof HTMLElement ? element : undefined;
  if (!htmlElement) {
    return undefined;
  }

  return htmlElement.closest<HTMLElement>(targetSelector) ?? htmlElement;
}

function collapseElement(element: Element): void {
  if (processed.has(element)) {
    return;
  }
  processed.add(element);

  const root = findMessageRoot(element);
  if (!root || root.textContent.length < THREADLIGHT_LONG_USER_THRESHOLD) {
    return;
  }

  root.classList.add(THREADLIGHT_LONG_USER_COLLAPSED_CLASS);
  const button = document.createElement("button");
  button.type = "button";
  button.className = EXPAND_BUTTON_CLASS;
  button.textContent = "Show full message";
  button.addEventListener("click", () => {
    root.classList.add(THREADLIGHT_LONG_USER_EXPANDED_CLASS);
    button.remove();
  });
  root.insertAdjacentElement("afterend", button);
}

function scanForLongMessages(): void {
  const scope = mainScope();
  scope.querySelectorAll(targetSelector).forEach(collapseElement);
}

// Undo every collapse so the next scan can re-evaluate (used on disable and mode switch).
function clearCollapseArtifacts(): void {
  document
    .querySelectorAll<HTMLElement>(`.${THREADLIGHT_LONG_USER_COLLAPSED_CLASS}`)
    .forEach((element) => {
      element.classList.remove(THREADLIGHT_LONG_USER_COLLAPSED_CLASS, THREADLIGHT_LONG_USER_EXPANDED_CLASS);
    });
  document.querySelectorAll<HTMLElement>(`.${EXPAND_BUTTON_CLASS}`).forEach((button) => button.remove());
  processed = new WeakSet<Element>();
}

function scheduleScan(): void {
  if (debounceHandle !== undefined) {
    window.clearTimeout(debounceHandle);
  }
  debounceHandle = window.setTimeout(() => {
    debounceHandle = undefined;
    scanForLongMessages();
  }, 250);
}

export function setUserCollapseEnabled(enabled: boolean, allRoles = false): void {
  const nextSelector = allRoles ? CHATGPT_MESSAGE_SELECTOR : CHATGPT_USER_MESSAGE_SELECTOR;
  const modeChanged = nextSelector !== targetSelector;
  targetSelector = nextSelector;
  document.documentElement.classList.toggle(THREADLIGHT_COLLAPSE_CLASS, enabled);

  if (!enabled) {
    observer?.disconnect();
    observer = undefined;
    if (debounceHandle !== undefined) {
      window.clearTimeout(debounceHandle);
      debounceHandle = undefined;
    }
    clearCollapseArtifacts();
    return;
  }

  if (modeChanged) {
    clearCollapseArtifacts();
  }

  ensureStyles();
  scanForLongMessages();

  if (!observer) {
    observer = new MutationObserver(scheduleScan);
    // Observe a stable root so the observer survives ChatGPT remounting <main> on navigation;
    // the scan itself stays scoped to the conversation via mainScope().
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }
}
