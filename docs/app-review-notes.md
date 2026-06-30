# App Review Notes Draft

ThreadLight is a Safari WebExtension utility for Safari users who keep long ChatGPT web conversations open.

## What It Does

- Runs only on `chatgpt.com` and `chat.openai.com`.
- Shows only the most recent visible turns in recognized long conversation responses.
- Keeps settings local.
- Allows users to disable the extension at any time.
- Does not change server-side ChatGPT data.

## What It Does Not Do

- Does not automate ChatGPT usage.
- Does not bypass limits, paywalls, access controls, or quotas.
- Does not send chat content to a server.
- Does not store chat content.
- Does not include analytics, telemetry, tracking, or remote config.
- Does not claim to be official or affiliated with OpenAI.

## Review Testing Notes

Use a long synthetic or test ChatGPT thread in Safari, enable the extension, and verify the current tab shows the configured recent-turn window. Disable the extension or suspend once and reload to show the full page again.
