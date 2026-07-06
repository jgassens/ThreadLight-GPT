export const CHATGPT_TURN_SELECTOR =
  '[data-testid="conversation-turn"], [data-testid^="conversation-turn-"], section[data-turn-id][data-turn]';
export const CHATGPT_MAIN_SELECTOR = "main";
export const CHATGPT_USER_MESSAGE_SELECTOR = '[data-message-author-role="user"]';
export const CHATGPT_MESSAGE_SELECTOR = "[data-message-author-role]";

// The conversation container to scope queries/observers to, falling back to the whole
// document when <main> is momentarily absent (route transitions, overlays).
export function mainScope(): Document | HTMLElement {
  return document.querySelector<HTMLElement>(CHATGPT_MAIN_SELECTOR) ?? document;
}

// The turn container: the parent of the rendered conversation turns. Scope MutationObservers to
// this rather than <main>, because ChatGPT's composer is a sibling inside <main> and observing its
// subtree makes every keystroke's editor mutations tax typing. Falls back to mainScope() until
// turns are rendered.
export function conversationScope(): Document | HTMLElement {
  const firstTurn = document.querySelector<HTMLElement>(CHATGPT_TURN_SELECTOR);
  return firstTurn?.parentElement ?? mainScope();
}
