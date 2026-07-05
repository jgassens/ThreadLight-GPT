# ThreadLight Privacy Policy Draft

ThreadLight is a local-only Safari WebExtension for long ChatGPT web conversations.

ThreadLight does not collect, sell, transmit, or analyze personal data. ThreadLight does not run a backend service and does not include analytics, telemetry, tracking, or remote configuration.

ThreadLight stores local settings such as whether the extension is enabled and how many recent visible turns to show. ThreadLight does not store chat content, prompts, responses, account data, cookies, browsing history, or conversation exports.

ThreadLight includes an optional Diagnostics mode for troubleshooting. Diagnostics are off by default, kept in memory for the current ChatGPT tab, and limited to sanitized timing, state, endpoint-type, DOM-count, and stall-duration metadata. Diagnostic logs do not include raw URLs, conversation IDs, headers, cookies, prompts, responses, or message text.

ThreadLight can read and modify pages on `chatgpt.com` and `chat.openai.com` only so it can reduce how much of a recognized conversation response is rendered in the current tab. Unknown response shapes are passed through unchanged.

Reloading ChatGPT restores the full conversation from ChatGPT's servers when trimming is disabled or suspended for that reload.

ThreadLight is an unofficial utility and is not affiliated with OpenAI.
