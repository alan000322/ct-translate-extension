## ADDED Requirements

### Requirement: Popup entry opens the passage translation page

The extension SHALL provide a standalone passage-translation page built as an extension page (unlisted page compiled to `passage.html`). The popup SHALL display an entry button labeled 「整段翻譯」 that opens this page in a new browser tab via `chrome.tabs.create` with the extension-internal URL.

#### Scenario: Open from popup

- **WHEN** the user clicks the 「整段翻譯」 button in the popup
- **THEN** a new browser tab opens showing the extension's passage-translation page

### Requirement: Paragraph detection from pasted text

The page SHALL detect paragraphs from the pasted plain text using pure text segmentation. The detector SHALL normalize CRLF to LF, split on runs of two or more consecutive newlines (blank lines), trim each resulting segment, and drop empty segments. When blank-line splitting yields a single segment but the text contains single newlines, the detector SHALL fall back to splitting on single newlines.

#### Scenario: Blank-line separated paragraphs

- **WHEN** the user pastes text containing paragraphs separated by blank lines and triggers translation
- **THEN** the system splits the text at the blank lines and presents one segment card per detected paragraph

#### Scenario: Single-newline fallback

- **WHEN** the pasted text contains no blank lines but contains single newlines
- **THEN** the system splits the text on single newlines instead

##### Example: segmentation rules

| Input | Detected segments | Notes |
| --- | --- | --- |
| `"A\n\nB\n\n\nC"` | `["A", "B", "C"]` | runs of 2+ newlines split |
| `"A\nB\nC"` | `["A", "B", "C"]` | single-newline fallback |
| `"A\r\n\r\nB"` | `["A", "B"]` | CRLF normalized before split |
| `"A\n\n   \n\nB"` | `["A", "B"]` | whitespace-only segment dropped |
| `"single paragraph"` | `["single paragraph"]` | no newline at all |

### Requirement: Lossless merge and split of adjacent segments

Before translation starts, the user SHALL be able to merge adjacent segments into one group via an interactive control between segment cards, and SHALL be able to split a merged group back into its originally detected segments. Detected segments are atomic: merging SHALL combine the texts of consecutive atoms joined with a newline for translation, and splitting SHALL restore exactly the originally detected atom texts. Merge and split controls SHALL be disabled while any translation or analysis task is in flight.

#### Scenario: Merge two adjacent segments

- **WHEN** the user activates the merge control between two adjacent segment cards
- **THEN** the two cards become a single card whose text is the two atom texts joined by a newline, and a subsequent translation sends that combined text as one request

#### Scenario: Split restores original detection

- **WHEN** the user splits a previously merged group
- **THEN** the group separates back into cards whose texts are byte-identical to the originally detected atoms

#### Scenario: Editing locked during tasks

- **WHEN** per-segment translation or a full-text analysis task is in progress
- **THEN** merge and split controls are disabled until the task completes, errors, or is cancelled

### Requirement: Per-segment streaming translation with bilingual layout

When the user triggers 「翻譯」, the system SHALL send one streaming translation request per segment group over the existing `translate-stream` Port channel, and SHALL render the translated text inside that segment's card directly below the original text, appearing incrementally as chunks arrive. At most 3 segment requests SHALL be in flight concurrently; remaining segments SHALL queue in document order. The translation target language SHALL follow the configured target language.

#### Scenario: Translations appear under each paragraph

- **WHEN** the user triggers translation on a multi-segment text
- **THEN** each segment card shows its translation streaming in below the original paragraph, and after completion every card shows original text above and translation below

#### Scenario: Concurrency cap

- **WHEN** translation is triggered on a text with more than 3 segment groups
- **THEN** at most 3 streaming requests run at once and remaining segments start in order as earlier ones finish

### Requirement: Segment-level error isolation and retry

A failed segment SHALL NOT affect other segments. The failing segment's card SHALL display the error message and a retry control that re-sends only that segment. A cancel-all control SHALL cancel every in-flight and queued segment request; cancellation SHALL NOT be presented as an error and cancelled cards SHALL return to their pre-translation state.

#### Scenario: One segment fails

- **WHEN** one segment's translation request fails while others succeed
- **THEN** only the failing card shows the error message with a retry control, and all other cards show their completed translations

#### Scenario: Retry a single segment

- **WHEN** the user activates retry on a failed segment card
- **THEN** the system re-sends only that segment's text and streams the result into that card

#### Scenario: Cancel all

- **WHEN** the user activates the cancel-all control during translation
- **THEN** all in-flight requests are cancelled, queued requests do not start, no error is shown, and unfinished cards return to their pre-translation state

### Requirement: Input guards

The page SHALL refuse to dispatch any task when the input is empty or whitespace-only, showing an empty-state hint instead. When the input exceeds 50,000 characters, all three action buttons SHALL be disabled and an over-limit hint with the current character count SHALL be shown. The page SHALL display a live character count.

#### Scenario: Whitespace-only input

- **WHEN** the user triggers any action with empty or whitespace-only input
- **THEN** no request is dispatched and the page shows the empty-state guidance

#### Scenario: Over the character limit

- **WHEN** the pasted text exceeds 50,000 characters
- **THEN** the 「翻譯」, 「全文摘要」, and 「研究重點剖析」 buttons are disabled and an over-limit hint is displayed

### Requirement: Task exclusivity

The page SHALL run only one task kind at a time: per-segment translation, full-text summary, and research analysis are mutually exclusive. While one is in flight, the other action buttons SHALL be disabled.

#### Scenario: Analysis blocked during translation

- **WHEN** per-segment translation is in progress
- **THEN** the 「全文摘要」 and 「研究重點剖析」 buttons are disabled until translation finishes or is cancelled
