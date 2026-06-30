# App Review Packet

## What ThreadLight Does

ThreadLight is a Safari Web Extension that helps reduce local rendering load in long ChatGPT web conversations. It runs only on:

- `https://chatgpt.com/*`
- `https://chat.openai.com/*`

It needs page access to modify the local rendered view of recognized long conversation responses in the current browser tab.

## What ThreadLight Does Not Do

- Does not automate ChatGPT usage.
- Does not bypass limits, paywalls, access controls, or quotas.
- Does not send chat content to a server.
- Does not store chat content.
- Does not use analytics, telemetry, tracking, or remote config.
- Does not claim to be official or affiliated with OpenAI.

## Privacy Answers

Data collected: none.

Tracking: no.

Third-party analytics: no.

Backend server: no.

Local storage: settings only, such as enabled state and retention count.

Chat content storage: no.

## Reviewer Test Steps

1. Install the app.
2. Enable the Safari extension.
3. Grant permission for ChatGPT domains.
4. Open ChatGPT in Safari.
5. Open a long conversation or create repeated synthetic test messages.
6. Use the ThreadLight toolbar popup to set how many recent turns to show.
7. Reload or use the restore button to restore the full conversation view for one reload.

ThreadLight has no OpenAI login, no test credentials, and no backend admin surface. Reviewers can use their own ChatGPT account or a public shared conversation page.

## Support Checklist

- Public privacy policy URL.
- Support email.
- FAQ or support page explaining Safari extension enablement.
- Known limitations page.

## Screenshot Checklist

- Native setup instructions.
- Popup controls.
- Optional status pill with synthetic or throwaway content only.
- Privacy/local-only summary.
- Restore full thread explanation.
