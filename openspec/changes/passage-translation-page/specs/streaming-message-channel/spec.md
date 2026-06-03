## MODIFIED Requirements

### Requirement: Streaming message envelope

The Port protocol SHALL use a typed message envelope. The content-to-background start message SHALL carry a request identifier, the source text, and an optional task kind field `task` whose value is one of `translate`, `summarize`, or `analyze`; when the field is absent the background SHALL treat the request as `translate`, preserving existing hover-translation callers unchanged. The background-to-content messages SHALL distinguish three terminal-or-progress states: an incremental chunk message, a done message, and an error message. Each background-to-content message SHALL carry the request identifier it corresponds to. A chunk message SHALL carry the newly produced increment of translated text (not the cumulative text so far).

#### Scenario: Progress then completion

- **WHEN** translation of a paragraph is in progress and then completes
- **THEN** the background sends one or more chunk messages each carrying a text increment for that request id, followed by a single done message for that request id

#### Scenario: Error envelope

- **WHEN** translation of a paragraph fails and cannot be recovered
- **THEN** the background sends an error message carrying the request id and a serializable error string, and sends no further chunk or done messages for that request id

#### Scenario: Task kind routing

- **WHEN** a start message carries `task: "summarize"` or `task: "analyze"`
- **THEN** the background runs the corresponding analysis task instead of translation and streams its output over the same chunk/done/error envelope

#### Scenario: Absent task field defaults to translate

- **WHEN** a start message carries no `task` field
- **THEN** the background treats the request as a translation request, identical to the pre-existing behavior

##### Example: envelope by direction

| Direction | Message shape |
| --- | --- |
| content → background | `{ type: "start", id, text, task? }` |
| content → background | `{ type: "cancel", id }` |
| background → content | `{ type: "chunk", id, delta }` |
| background → content | `{ type: "done", id }` |
| background → content | `{ type: "error", id, message }` |
