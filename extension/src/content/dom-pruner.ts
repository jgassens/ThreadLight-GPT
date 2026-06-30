import {
  THREADLIGHT_DOM_PRUNE_CLASS,
  THREADLIGHT_HIDDEN_TURN_CLASS
} from "../shared/constants";
import type { ThreadLightSettingsV1 } from "../shared/types";
import { CHATGPT_TURN_SELECTOR } from "./dom-selectors";

const STYLE_ID = "threadlight-dom-prune-style";
const DELAYED_PRUNE_MS = [400, 1200, 3000] as const;
// Re-prune this long after scrolling stops, never during an active scroll.
const SCROLL_IDLE_MS = 200;
export const MIN_HIDDEN_TURN_GROUPS_FOR_DOM_PRUNING = 3;

let pruneHandles: number[] = [];

export interface DomPruneStats {
  /** Total rendered turns, counting consecutive same-role messages as one turn. */
  totalTurns: number;
  /** Turns currently visible. */
  keptTurns: number;
  /** Turns currently hidden. */
  hiddenTurns: number;
  /** Whether ThreadLight is actively hiding turns right now. */
  pruned: boolean;
}

type DomPruneListener = (stats: DomPruneStats) => void;

let activeSettings: ThreadLightSettingsV1 | undefined;
let pruneListener: DomPruneListener | undefined;
let scrollListenerAttached = false;
let isScrolling = false;
let scrollIdleHandle: number | undefined;
let lastSignature = "";

export function hiddenTurnIndexes(totalTurns: number, keepLastTurns: number): number[] {
  const hiddenCount = Math.max(0, totalTurns - keepLastTurns);
  return Array.from({ length: hiddenCount }, (_value, index) => index);
}

export function turnElementGroups(turnRoles: readonly (string | undefined)[]): number[][] {
  const groups: number[][] = [];
  let previousRole: string | undefined;

  turnRoles.forEach((role, index) => {
    const normalizedRole = role && role.length > 0 ? role : `unknown:${index}`;
    if (normalizedRole === previousRole && groups.length > 0) {
      groups[groups.length - 1]?.push(index);
    } else {
      groups.push([index]);
      previousRole = normalizedRole;
    }
  });

  return groups;
}

export function shouldApplyDomPruning(totalTurnGroups: number, keepLastTurns: number): boolean {
  return hiddenTurnIndexes(totalTurnGroups, keepLastTurns).length >= MIN_HIDDEN_TURN_GROUPS_FOR_DOM_PRUNING;
}

export function hiddenTurnElementIndexes(
  turnRoles: readonly (string | undefined)[],
  keepLastTurns: number
): number[] {
  const groups = turnElementGroups(turnRoles);
  if (!shouldApplyDomPruning(groups.length, keepLastTurns)) {
    return [];
  }

  const hiddenGroups = new Set(hiddenTurnIndexes(groups.length, keepLastTurns));
  return groups.flatMap((group, groupIndex) => (hiddenGroups.has(groupIndex) ? group : []));
}

/** Pure turn accounting used to drive the status pill, in role-grouped "turn" units. */
export function domPruneStats(
  turnRoles: readonly (string | undefined)[],
  keepLastTurns: number
): DomPruneStats {
  const groups = turnElementGroups(turnRoles);
  const totalTurns = groups.length;
  const hiddenTurns = shouldApplyDomPruning(totalTurns, keepLastTurns)
    ? hiddenTurnIndexes(totalTurns, keepLastTurns).length
    : 0;
  return {
    totalTurns,
    keptTurns: totalTurns - hiddenTurns,
    hiddenTurns,
    pruned: hiddenTurns > 0
  };
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) {
    return;
  }

  const style = document.createElement("style");
  style.id = STYLE_ID;
  style.textContent = `
html.${THREADLIGHT_DOM_PRUNE_CLASS} .${THREADLIGHT_HIDDEN_TURN_CLASS} {
  display: none !important;
}`;
  document.documentElement.append(style);
}

function clearScheduledPrunes(): void {
  pruneHandles.forEach((handle) => window.clearTimeout(handle));
  pruneHandles = [];
}

function turnElements(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>(CHATGPT_TURN_SELECTOR));
}

function turnRole(turn: HTMLElement): string | undefined {
  return (
    turn.getAttribute("data-turn") ??
    turn.getAttribute("data-message-author-role") ??
    turn.querySelector<HTMLElement>("[data-message-author-role]")?.getAttribute("data-message-author-role") ??
    undefined
  );
}

function clearHiddenTurns(): void {
  const hadPruningClass = document.documentElement.classList.contains(THREADLIGHT_DOM_PRUNE_CLASS);
  document.documentElement.classList.remove(THREADLIGHT_DOM_PRUNE_CLASS);
  lastSignature = "";
  if (!hadPruningClass) {
    return;
  }

  turnElements().forEach((turn) => {
    if (turn.classList.contains(THREADLIGHT_HIDDEN_TURN_CLASS)) {
      turn.classList.remove(THREADLIGHT_HIDDEN_TURN_CLASS);
    }
  });
}

// The nearest scrollable ancestor of the conversation, falling back to the document.
function findScrollContainer(fromElement: HTMLElement | undefined): HTMLElement {
  let element: HTMLElement | null = fromElement?.parentElement ?? null;
  while (element && element !== document.body && element !== document.documentElement) {
    const overflowY = window.getComputedStyle(element).overflowY;
    if ((overflowY === "auto" || overflowY === "scroll") && element.scrollHeight > element.clientHeight + 1) {
      return element;
    }
    element = element.parentElement;
  }
  return (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

// First visible, non-hidden turn intersecting the viewport — used to keep scroll stable.
function viewportAnchor(turns: HTMLElement[]): HTMLElement | undefined {
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  for (const turn of turns) {
    if (turn.classList.contains(THREADLIGHT_HIDDEN_TURN_CLASS)) {
      continue;
    }
    const rect = turn.getBoundingClientRect();
    if (rect.bottom > 0 && rect.top < viewportHeight) {
      return turn;
    }
  }
  return undefined;
}

function reportStats(turns: HTMLElement[], keepLastTurns: number): void {
  pruneListener?.(domPruneStats(turns.map(turnRole), keepLastTurns));
}

function applyTurnPruning(keepLastTurns: number): boolean {
  const turns = turnElements();
  if (turns.length === 0) {
    pruneListener?.({ totalTurns: 0, keptTurns: 0, hiddenTurns: 0, pruned: false });
    return false;
  }

  const hiddenIndexes = new Set(hiddenTurnElementIndexes(turns.map(turnRole), keepLastTurns));
  const alreadyPruning = document.documentElement.classList.contains(THREADLIGHT_DOM_PRUNE_CLASS);

  if (hiddenIndexes.size === 0) {
    if (alreadyPruning) {
      clearHiddenTurns();
    }
    reportStats(turns, keepLastTurns);
    return false;
  }

  const signature = `${turns.length}:${keepLastTurns}:${[...hiddenIndexes].join(",")}`;
  if (signature === lastSignature && alreadyPruning) {
    // Nothing visible would change; skip DOM writes so we never disturb scrolling.
    reportStats(turns, keepLastTurns);
    return true;
  }

  // Record where a visible turn sits so we can hold the viewport steady after hiding
  // turns above it (otherwise collapsing earlier turns makes the page lurch).
  const anchor = viewportAnchor(turns);
  const scroller = findScrollContainer(turns[0]);
  const anchorTopBefore = anchor?.getBoundingClientRect().top ?? 0;

  document.documentElement.classList.add(THREADLIGHT_DOM_PRUNE_CLASS);
  turns.forEach((turn, index) => {
    const shouldHide = hiddenIndexes.has(index);
    if (turn.classList.contains(THREADLIGHT_HIDDEN_TURN_CLASS) !== shouldHide) {
      turn.classList.toggle(THREADLIGHT_HIDDEN_TURN_CLASS, shouldHide);
    }
  });

  if (anchor && !anchor.classList.contains(THREADLIGHT_HIDDEN_TURN_CLASS)) {
    const delta = anchor.getBoundingClientRect().top - anchorTopBefore;
    if (Number.isFinite(delta) && delta !== 0) {
      scroller.scrollTop += delta;
    }
  }

  lastSignature = signature;
  reportStats(turns, keepLastTurns);
  return true;
}

function pruneNow(): boolean {
  if (!activeSettings?.enabled) {
    return false;
  }
  return applyTurnPruning(activeSettings.keepLastTurns);
}

function scheduleDelayedPrunes(): void {
  clearScheduledPrunes();
  pruneHandles = DELAYED_PRUNE_MS.map((delay) => {
    const handle = window.setTimeout(() => {
      pruneHandles = pruneHandles.filter((storedHandle) => storedHandle !== handle);
      // Defer if mid-scroll; the scroll-idle pass will catch up smoothly.
      if (!isScrolling) {
        pruneNow();
      }
    }, delay);
    return handle;
  });
}

function onScroll(): void {
  isScrolling = true;
  if (scrollIdleHandle !== undefined) {
    window.clearTimeout(scrollIdleHandle);
  }
  scrollIdleHandle = window.setTimeout(() => {
    scrollIdleHandle = undefined;
    isScrolling = false;
    pruneNow();
  }, SCROLL_IDLE_MS);
}

function attachScrollListener(): void {
  if (scrollListenerAttached) {
    return;
  }
  scrollListenerAttached = true;
  // Capture phase so we also see scrolling inside ChatGPT's inner scroll container.
  window.addEventListener("scroll", onScroll, { capture: true, passive: true });
}

function detachScrollListener(): void {
  if (!scrollListenerAttached) {
    return;
  }
  scrollListenerAttached = false;
  window.removeEventListener("scroll", onScroll, { capture: true });
  if (scrollIdleHandle !== undefined) {
    window.clearTimeout(scrollIdleHandle);
    scrollIdleHandle = undefined;
  }
  isScrolling = false;
}

export function setDomPruning(settings: ThreadLightSettingsV1, onPrune?: DomPruneListener): void {
  if (onPrune) {
    pruneListener = onPrune;
  }
  activeSettings = settings;
  clearScheduledPrunes();

  if (!settings.enabled) {
    detachScrollListener();
    clearHiddenTurns();
    pruneListener?.({ totalTurns: 0, keptTurns: 0, hiddenTurns: 0, pruned: false });
    return;
  }

  ensureStyles();
  attachScrollListener();
  // keepLastTurns may have changed; force a fresh comparison.
  lastSignature = "";
  if (pruneNow()) {
    scheduleDelayedPrunes();
  }
}
