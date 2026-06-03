## ADDED Requirements

### Requirement: Throttled autosave of passage draft

The passage translation page SHALL persist the source text and the segment group markings to extension local storage under a dedicated draft key, separate from the configuration key. After any change to the source text or the group markings, the draft SHALL be written within 3 seconds. Multiple changes occurring inside one pending 3-second window SHALL coalesce into a single write that captures the latest state. While the draft content is unchanged, the page SHALL NOT issue storage writes.

#### Scenario: Change is persisted within the throttle window

- **WHEN** the user edits the source text or merges/splits segment groups
- **THEN** the draft containing the latest text and groups is written to the draft storage key within 3 seconds

#### Scenario: Rapid consecutive changes coalesce into one write

- **WHEN** the user makes several edits within a single pending 3-second window
- **THEN** exactly one storage write occurs for that window and it contains the final state

##### Example: three edits, one write

- **GIVEN** an empty draft and fake timers at t=0
- **WHEN** the text changes at t=0s ("A"), t=1s ("AB"), and t=2s ("ABC")
- **THEN** exactly one write occurs at t=3s with text "ABC"

#### Scenario: Idle page issues no writes

- **WHEN** the page is open and no change has occurred since the last persisted write
- **THEN** no further storage writes are issued

### Requirement: Immediate flush on page hide

The passage translation page SHALL flush any pending draft write immediately when the page becomes hidden or is being unloaded, so that switching tabs or closing the page normally does not lose changes made inside the last throttle window.

#### Scenario: Flush on visibility change to hidden

- **WHEN** the document visibility changes to hidden while a draft write is pending
- **THEN** the pending draft is written immediately

#### Scenario: Flush on page unload

- **WHEN** the page receives a pagehide event while a draft write is pending
- **THEN** the pending draft is written immediately

### Requirement: Silent draft restore on page open

When the passage translation page opens, it SHALL load the stored draft, validate it against the draft schema, and silently restore the source text and the segment group markings without any confirmation prompt. The restored page SHALL be in the compose state with the same character count, detected segments, and group markings as if the user had pasted the same text and performed the same merges manually. Translation results and analysis results SHALL NOT be restored.

#### Scenario: Valid draft is restored

- **WHEN** the page opens and a schema-valid draft exists in storage
- **THEN** the source text and group markings are restored and the page shows the compose state with segment cards reflecting the stored groups

#### Scenario: No draft yields the empty state

- **WHEN** the page opens and no draft exists in storage
- **THEN** the page shows the empty compose state

### Requirement: Corrupt or inconsistent draft degrades silently

A stored draft that fails schema validation SHALL be treated as absent: the page SHALL show the empty compose state without any user-facing error, and the corrupt value SHALL be removed from storage. A draft whose group markings are inconsistent with the segments re-detected from its text SHALL keep the text and fall back to the initial one-group-per-segment markings.

#### Scenario: Schema-invalid draft is discarded

- **WHEN** the page opens and the stored draft value fails schema validation
- **THEN** the page shows the empty compose state, no error is shown, and the corrupt value is removed from storage

#### Scenario: Inconsistent groups fall back to initial groups

- **WHEN** the page opens with a draft whose groups do not exactly cover the segments re-detected from the stored text
- **THEN** the text is restored and the group markings fall back to one group per detected segment

##### Example: stale groups after segmentation mismatch

- **GIVEN** a stored draft with text that re-detects into 3 segments and groups [{start:0,end:1},{start:2,end:3}]
- **WHEN** the page opens and validates the draft
- **THEN** the text is restored and groups become [{start:0,end:0},{start:1,end:1},{start:2,end:2}]

### Requirement: Draft cleared when source is emptied

When the user clears the source text to empty (no non-whitespace content), the stored draft SHALL be removed instead of writing an empty draft.

#### Scenario: Emptying the source removes the draft

- **WHEN** the user deletes all source text so the input has no non-whitespace content
- **THEN** the draft key is removed from storage and reopening the page shows the empty compose state

### Requirement: Storage write failures do not block editing

A failed draft write (such as a storage quota error) SHALL NOT interrupt or block the user's editing, translation, or analysis actions, and SHALL NOT surface an error. The next change SHALL schedule a new write attempt.

#### Scenario: Write failure is silent and retried on next change

- **WHEN** a draft write fails
- **THEN** editing continues uninterrupted, no error is shown, and the next change schedules a new write
