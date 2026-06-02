# translation-providers Specification

## Purpose

TBD - created by archiving change 'hover-translation-mvp'. Update Purpose after archive.

## Requirements

### Requirement: Background-only translation execution

All provider API calls and network requests SHALL execute in the background service worker. Content scripts SHALL NOT call provider SDKs or translation endpoints directly. API keys SHALL NOT be exposed to page context.

#### Scenario: Content script delegates translation

- **WHEN** a content script needs a paragraph translated
- **THEN** it sends a `translate` message with `{ text }` to the background worker and receives the translated string, without any provider SDK or API key present in page context

---
### Requirement: Provider dispatch by active provider

The system SHALL provide a single entry point `translateText(text, config)` that routes to the correct provider implementation based on the active provider configuration. Supported providers SHALL be `openai`, `anthropic`, `google-gemini`, and `google-translate`.

#### Scenario: Route to an LLM provider

- **WHEN** the active provider is `openai`, `anthropic`, or `google-gemini`
- **THEN** `translateText` calls that provider's official-SDK translation function with the configured model, API key, and the target language name

#### Scenario: Route to Google Translate free endpoint

- **WHEN** the active provider is `google-translate`
- **THEN** `translateText` calls the Google Translate free endpoint via hand-written fetch using ISO 639-1 source/target codes, with no API key required

---
### Requirement: Language code mapping for two provider classes

The system SHALL convert language codes per provider class: Google Translate SHALL receive ISO 639-1 codes (with `auto` allowed for source), and LLM providers SHALL receive the target language's English name.

#### Scenario: Map codes per provider class

- **WHEN** the target language is Traditional Chinese and source is auto-detect
- **THEN** Google Translate receives source `auto` and a Traditional-Chinese ISO 639-1 target, while an LLM provider receives the English language name "Traditional Chinese"

##### Example: code mapping by provider

| Provider | Source input | Target input |
| --- | --- | --- |
| google-translate | `auto` | `zh-TW` |
| openai / anthropic / google-gemini | (n/a) | `Traditional Chinese` |

---
### Requirement: Missing API key is surfaced, not silent

When an LLM provider is active but no API key is configured, the system SHALL fail with a serializable error message rather than silently returning empty output.

#### Scenario: LLM provider without key

- **WHEN** the active provider is an LLM provider and its API key is empty
- **THEN** `translateText` throws an error whose message names the provider and the missing key, and the background worker returns an `{ error }` shape to the caller

---
### Requirement: Provider function signature consistency

Each provider translation function SHALL accept the input text, the target language descriptor, and an options object, and SHALL return a `Promise<string>` containing only the translation.

#### Scenario: Provider returns plain translation

- **WHEN** any provider function completes successfully
- **THEN** it resolves to a trimmed string containing only the translated text, with no added commentary or markup
