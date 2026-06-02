# streaming-translation Specification

## Purpose

TBD - created by archiving change 'hover-translation-streaming'. Update Purpose after archive.

## Requirements

### Requirement: LLM providers stream output as chunks

Each LLM provider (OpenAI, Anthropic, Google Gemini) SHALL offer a streaming translation path that enables the SDK's streaming mode and yields incremental text chunks as they arrive, instead of returning only a single complete string. A provider streaming function SHALL accept the input text, the target language descriptor, an options object, and an optional abort signal, and SHALL yield increments of the translated text in order.

#### Scenario: Provider yields increments in order

- **WHEN** an LLM provider's streaming translation runs to completion
- **THEN** it yields the translated text as an ordered sequence of increments whose concatenation equals the full translation, with no added commentary or markup

##### Example: streaming mode per provider

| Provider | Streaming call | Increment source |
| --- | --- | --- |
| openai | `chat.completions.create` with `stream: true` | `choices[0].delta.content` |
| anthropic | streaming `messages` request | `content_block_delta` text |
| google-gemini | `generateContentStream` | chunk text |

---
### Requirement: Dispatcher exposes a unified streaming interface

The translation dispatcher SHALL expose a streaming entry point that routes to the active provider and yields translated text increments. When the active provider is `google-translate` (a non-streaming free endpoint), the dispatcher SHALL adapt it to the same streaming interface by yielding the complete translation as a single increment. The dispatcher SHALL propagate the abort signal to the active provider.

#### Scenario: Route to a streaming LLM provider

- **WHEN** the active provider is `openai`, `anthropic`, or `google-gemini`
- **THEN** the dispatcher's streaming entry point yields that provider's incremental chunks in order

#### Scenario: Adapt non-streaming Google Translate to the streaming interface

- **WHEN** the active provider is `google-translate`
- **THEN** the dispatcher obtains the full translation from the non-streaming endpoint and yields it as a single increment, so callers consume one uniform streaming interface regardless of provider

---
### Requirement: Typewriter incremental rendering preserves bilingual insertion and toggle

The content rendering path SHALL append translated increments into the paragraph's existing translation node as they arrive (typewriter effect), instead of replacing a placeholder with the full text in one step. The existing behavior SHALL be preserved: the translation is inserted as a no-translate wrapper beneath the source paragraph (with a line break before block paragraphs), triggering the same paragraph again removes the wrapper (toggle), and a per-paragraph failure is shown only within that paragraph's wrapper without affecting other paragraphs.

#### Scenario: Increments append into the wrapper

- **WHEN** chunk messages arrive for a paragraph being translated
- **THEN** each increment is appended to that paragraph's translation node so the translation grows character-by-character, and on the done message the wrapper is finalized

#### Scenario: Toggle and failure isolation still hold

- **WHEN** a paragraph that is streaming or already translated is triggered again, or its translation fails
- **THEN** triggering again removes the wrapper (toggle), and a failure shows an error indication only within that paragraph's wrapper while other paragraphs remain intact

---
### Requirement: Streaming is the default for single-paragraph AI translation

Single-paragraph (hover) AI translation SHALL use the streaming path by default, with no user-facing toggle required to enable it. The non-streaming path SHALL exist only as an internal fallback and SHALL NOT be presented as a user-selectable option. This requirement SHALL apply only to single-paragraph (hover) translation; full-page translation is out of scope and SHALL NOT use character-level streaming.

#### Scenario: Hover translation streams without configuration

- **WHEN** the user triggers single-paragraph hover translation with an LLM provider and default settings
- **THEN** the translation is delivered via the streaming path (typewriter) without the user having enabled any streaming option

---
### Requirement: Fallback to non-streaming on streaming failure

When a provider's streaming call fails to start or errors before producing output, the background SHALL fall back to the provider's non-streaming translation function and deliver the complete result as a single increment followed by a done message, so the user still receives a translation (non-typewriter). If the non-streaming fallback also fails, the background SHALL surface an error.

#### Scenario: Streaming call fails, fallback succeeds

- **WHEN** the active provider's streaming call throws before producing any output
- **THEN** the background invokes the provider's non-streaming function, pushes the full translation as a single chunk followed by a done message, and the user sees the complete translation rendered at once

#### Scenario: Both streaming and fallback fail

- **WHEN** both the streaming call and the non-streaming fallback fail
- **THEN** the background sends an error message and the paragraph's wrapper shows a failure indication
