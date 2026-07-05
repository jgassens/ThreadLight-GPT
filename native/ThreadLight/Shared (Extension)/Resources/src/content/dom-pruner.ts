import {
  THREADLIGHT_DOM_PRUNE_CLASS,
  THREADLIGHT_HIDDEN_TURN_CLASS
} from "../shared/constants";
import type { ThreadLightSettingsV1 } from "../shared/types";
import { CHATGPT_TURN_SELECTOR, mainScope } from "./dom-selectors";

const STYLE_ID = "threadlight-dom-prune-style";
const DELAYED_PRUNE_MS = [400, 1200, 3000] as const;
// Re-prune this long after scrolling stops, never during an active scroll.
const SCROLL_IDLE_MS = 200;
// Treat the conversation as busy while turns are streaming in; only prune once the DOM has
// been quiet this long. This keeps pruning (and its scroll compensation) out of the way during
// generation, so we never hide a turn or fight ChatGPT's auto-scroll while a reply is arriving.
const MUTATION_IDLE_MS = 700;
// Ignore scroll events this long after our own scrollTop compensation, so the programmatic
// scroll never re-enters onScroll and schedules a redundant prune pass.
const SELF_SCROLL_SUPPRESS_MS = 100;
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
let quietRetryHandle: number | undefined;
let lastSignature = "";
let lastScrollAt = 0;
let lastMutationAt = 0;
let suppressScrollUntil = 0;
let mutationObserver: MutationObserver | undefined;
let observedScope: Document | Element | undefined;

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
  if (quietRetryHandle !== undefined) {
    window.clearTimeout(quietRetryHandle);
    quietRetryHandle = undefined;
  }
}

function turnElements(): HTMLElement[] {
  return Array.from(mainScope().querySelectorAll<HTMLElement>(CHATGPT_TURN_SELECTOR));
}

function turnRole(turn: HTMLElement): string | undefined {
  return (
    turn.getAttribute("data-turn") ??
    turn.getAttribute("data-message-author-role") ??
    turn.querySelector<HTMLElement>("[data-message-author-role]")?.getAttribute("data-message-author-role") ??
    undefined
  );
}

function resetPruneCache(): void {
  lastSignature = "";
}

function clearHiddenTurns(): void {
  const hadPruningClass = document.documentElement.classList.contains(THREADLIGHT_DOM_PRUNE_CLASS);
  document.documentElement.classList.remove(THREADLIGHT_DOM_PRUNE_CLASS);
  resetPruneCache();
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

function reportStats(roles: readonly (string | undefined)[], keepLastTurns: number): void {
  pruneListener?.(domPruneStats(roles, keepLastTurns));
}

// Busy while the user is scrolling or the conversation is still mutating (a reply streaming in).
function isBusy(): boolean {
  return isScrolling || Date.now() - lastMutationAt < MUTATION_IDLE_MS;
}

function scheduleQuietRetry(): void {
  if (quietRetryHandle !== undefined) {
    return;
  }
  quietRetryHandle = window.setTimeout(() => {
    quietRetryHandle = undefined;
    pruneNow();
  }, MUTATION_IDLE_MS);
}

function applyTurnPruning(keepLastTurns: number): boolean {
  const turns = turnElements();

  if (turns.length === 0) {
    reportStats([], keepLastTurns);
    return false;
  }

  const roles = turns.map(turnRole);
  const hiddenIndexes = new Set(hiddenTurnElementIndexes(roles, keepLastTurns));
  const alreadyPruning = document.documentElement.classList.contains(THREADLIGHT_DOM_PRUNE_CLASS);

  if (hiddenIndexes.size === 0) {
    if (alreadyPruning) {
      clearHiddenTurns();
    }
    reportStats(roles, keepLastTurns);
    return false;
  }

  // The signature is derived from the live roles, so a change in grouping (e.g. a turn whose
  // data-turn hydrates after insertion, or recycled nodes) produces a new signature and forces a
  // fresh pass. It is the sole cache: nothing else is allowed to short-circuit recomputation.
  const signature = `${turns.length}:${keepLastTurns}:${[...hiddenIndexes].join(",")}`;
  if (signature === lastSignature && alreadyPruning) {
    // Nothing visible would change; skip DOM writes so we never disturb scrolling.
    reportStats(roles, keepLastTurns);
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
      suppressScrollUntil = Date.now() + SELF_SCROLL_SUPPRESS_MS;
      scroller.scrollTop += delta;
    }
  }

  lastSignature = signature;
  reportStats(roles, keepLastTurns);
  return true;
}

function pruneNow(): boolean {
  if (!activeSettings?.enabled) {
    return false;
  }
  // Defer while the page is busy (scrolling or a reply streaming in) and retry once it goes quiet.
  // Bailing here also avoids the turnElements() query on every scroll/mutation during generation.
  if (isBusy()) {
    scheduleQuietRetry();
    return document.documentElement.classList.contains(THREADLIGHT_DOM_PRUNE_CLASS);
  }
  return applyTurnPruning(activeSettings.keepLastTurns);
}

function scheduleDelayedPrunes(): void {
  clearScheduledPrunes();
  pruneHandles = DELAYED_PRUNE_MS.map((delay) => {
    const handle = window.setTimeout(() => {
      pruneHandles = pruneHandles.filter((storedHandle) => storedHandle !== handle);
      pruneNow();
    }, delay);
    return handle;
  });
}

function onScroll(): void {
  // Ignore the scroll our own scrollTop compensation just triggered.
  if (Date.now() < suppressScrollUntil) {
    return;
  }
  isScrolling = true;
  lastScrollAt = Date.now();
  if (scrollIdleHandle !== undefined) {
    return;
  }

  const check = (): void => {
    const elapsed = Date.now() - lastScrollAt;
    if (elapsed >= SCROLL_IDLE_MS) {
      scrollIdleHandle = undefined;
      isScrolling = false;
      pruneNow();
    } else {
      scrollIdleHandle = window.setTimeout(check, SCROLL_IDLE_MS - elapsed);
    }
  };

  scrollIdleHandle = window.setTimeout(check, SCROLL_IDLE_MS);
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

function onMutation(): void {
  lastMutationAt = Date.now();
  // Prune shortly after the conversation stops mutating (i.e. the reply finished streaming).
  scheduleQuietRetry();
}

function attachMutationObserver(): void {
  const scope = mainScope();
  if (mutationObserver && observedScope === scope) {
    return;
  }
  mutationObserver?.disconnect();
  observedScope = scope;
  mutationObserver = new MutationObserver(onMutation);
  // childList/subtree only: attribute writes (our own hidden-turn toggles) must not mark us busy.
  mutationObserver.observe(scope, { childList: true, subtree: true });
}

function detachMutationObserver(): void {
  mutationObserver?.disconnect();
  mutationObserver = undefined;
  observedScope = undefined;
}

export function setDomPruning(settings: ThreadLightSettingsV1, onPrune?: DomPruneListener): void {
  if (onPrune) {
    pruneListener = onPrune;
  }
  activeSettings = settings;
  clearScheduledPrunes();

  if (!settings.enabled) {
    detachScrollListener();
    detachMutationObserver();
    clearHiddenTurns();
    reportStats([], settings.keepLastTurns);
    return;
  }

  ensureStyles();
  attachScrollListener();
  attachMutationObserver();
  // keepLastTurns may have changed; force a fresh comparison.
  resetPruneCache();
  pruneNow();
  scheduleDelayedPrunes();
}
