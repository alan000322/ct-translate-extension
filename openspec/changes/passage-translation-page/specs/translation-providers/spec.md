## MODIFIED Requirements

### Requirement: Provider function signature consistency

Each provider completion function SHALL accept the input text, a caller-assembled system prompt, and an options object, and SHALL return a `Promise<string>` (non-streaming) or an `AsyncIterable<string>` of increments (streaming) containing only the model output. Providers SHALL NOT assemble task-specific prompts themselves; prompt assembly is the caller's responsibility.

#### Scenario: Provider returns plain translation

- **WHEN** any provider function completes successfully
- **THEN** it resolves to a trimmed string containing only the translated text, with no added commentary or markup

#### Scenario: Provider receives an externally assembled system prompt

- **WHEN** a caller invokes a provider function for any task kind
- **THEN** the provider sends the given system prompt and user text to its SDK unchanged, without injecting task-specific instructions of its own

## ADDED Requirements

### Requirement: Task-based prompt assembly and routing

The system SHALL provide task routing entry points `runTaskStream(task, text, config, signal)` and `runTask(task, text, config)` in the translation core. For task `translate` they SHALL assemble the existing translation system prompt with the configured target language; for `summarize` and `analyze` they SHALL assemble the corresponding analysis system prompts (fixed Traditional Chinese output). The existing `translateText` and `translateTextStream` entry points SHALL remain available with unchanged signatures as thin wrappers over the `translate` task. All task execution SHALL remain in the background service worker with API keys never exposed to page context, and missing-key and unknown-provider errors SHALL surface with the same named error behavior as translation.

#### Scenario: Translate task preserves existing entry points

- **WHEN** existing callers invoke `translateText` or `translateTextStream`
- **THEN** behavior and signatures are unchanged from before this change

#### Scenario: Analysis task routes through the same provider channel

- **WHEN** the background receives a `summarize` or `analyze` task
- **THEN** it assembles that task's system prompt, routes to the active provider's streaming function, and falls back to the non-streaming variant when streaming fails before producing any chunk

#### Scenario: Missing key on an analysis task

- **WHEN** an analysis task runs while the active LLM provider has no API key
- **THEN** the task fails with an error message naming the provider and the missing key, delivered over the error envelope
