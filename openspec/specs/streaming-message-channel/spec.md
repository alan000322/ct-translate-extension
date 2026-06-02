# streaming-message-channel Specification

## Purpose

TBD - created by archiving change 'hover-translation-streaming'. Update Purpose after archive.

## Requirements

### Requirement: Long-lived Port replaces one-shot messaging for streaming

The content script SHALL request single-paragraph translation over a long-lived connection established with `chrome.runtime.connect()` (Port named `translate-stream`), instead of a one-shot `chrome.runtime.sendMessage`/`sendResponse` exchange. The background service worker SHALL accept the connection via `chrome.runtime.onConnect` and push translation output incrementally over the same Port. API keys SHALL NOT be exposed to page context.

#### Scenario: Content opens a streaming connection

- **WHEN** the content script needs a paragraph translated
- **THEN** it opens a `translate-stream` Port, sends a start message carrying the paragraph text, and receives translation output as a sequence of messages over that Port, with no provider SDK or API key present in page context

#### Scenario: Background pushes over the same connection

- **WHEN** the background worker produces translation output for a request
- **THEN** it sends that output to the content script over the open Port rather than via a single `sendResponse` reply

---
### Requirement: Streaming message envelope

The Port protocol SHALL use a typed message envelope. The content-to-background start message SHALL carry a request identifier and the source text. The background-to-content messages SHALL distinguish three terminal-or-progress states: an incremental chunk message, a done message, and an error message. Each background-to-content message SHALL carry the request identifier it corresponds to. A chunk message SHALL carry the newly produced increment of translated text (not the cumulative text so far).

#### Scenario: Progress then completion

- **WHEN** translation of a paragraph is in progress and then completes
- **THEN** the background sends one or more chunk messages each carrying a text increment for that request id, followed by a single done message for that request id

#### Scenario: Error envelope

- **WHEN** translation of a paragraph fails and cannot be recovered
- **THEN** the background sends an error message carrying the request id and a serializable error string, and sends no further chunk or done messages for that request id

##### Example: envelope by direction

| Direction | Message shape |
| --- | --- |
| content → background | `{ type: "start", id, text }` |
| content → background | `{ type: "cancel", id }` |
| background → content | `{ type: "chunk", id, delta }` |
| background → content | `{ type: "done", id }` |
| background → content | `{ type: "error", id, message }` |

---
### Requirement: Mid-stream cancellation

When the user un-triggers a paragraph (toggles it off) or the content context goes away while a stream is in progress, the system SHALL cancel the in-flight translation so the background stops producing and pushing further output. The background SHALL stop work upon Port disconnection or upon receiving a cancel message for the request. Cancellation SHALL NOT be reported to the content script as an error.

#### Scenario: Toggle off during streaming

- **WHEN** a paragraph is mid-stream and the user triggers the same paragraph again to toggle it off
- **THEN** the content script signals cancellation for that request id, the background stops producing output and pushes no further chunks, and the partially inserted translation is removed per the existing toggle behavior

#### Scenario: Late chunks after cancellation are discarded

- **WHEN** a request has been cancelled but a chunk for that request id still arrives at the content script
- **THEN** the content script discards that chunk and does not write it into the page
