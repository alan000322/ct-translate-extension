# hover-paragraph-translation Specification

## Purpose

TBD - created by archiving change 'hover-translation-mvp'. Update Purpose after archive.

## Requirements

### Requirement: Hover plus hotkey trigger

The system SHALL translate the paragraph under the cursor when the user hovers over it and holds the configured hotkey (default Control). A trigger module SHALL track the cursor position and detect intent without performing translation itself. The trigger SHALL be ignored when the event target is an input, textarea, or contenteditable element.

#### Scenario: Hold hotkey over a paragraph

- **WHEN** the cursor is over a translatable paragraph and the user holds the configured hotkey past a short delay
- **THEN** the system resolves the cursor point and requests translation of the nearest block paragraph at that point

#### Scenario: Ignore inside editable fields

- **WHEN** the cursor is inside an input, textarea, or contenteditable element and the hotkey is held
- **THEN** no translation is triggered

#### Scenario: Short delay prevents accidental trigger

- **WHEN** the user taps and releases the hotkey faster than the configured delay
- **THEN** no translation is triggered

---
### Requirement: Find nearest block paragraph from a point

The system SHALL resolve a screen point to the nearest enclosing block-level paragraph by walking up from the element at that point.

#### Scenario: Resolve point to block

- **WHEN** a trigger point falls on an inline element inside a paragraph
- **THEN** the system selects the nearest enclosing block-level paragraph as the translation target

---
### Requirement: Bilingual insertion with toggle

The system SHALL insert the translation as a wrapper appended beneath the source paragraph, marked with a no-translate class. While translating, the system SHALL show a placeholder that is replaced by the result on completion. Triggering the same paragraph again SHALL remove the inserted translation.

#### Scenario: Insert then toggle off

- **WHEN** a paragraph is translated and the user triggers the same paragraph again
- **THEN** the first trigger appends the translation wrapper beneath the source text, and the second trigger removes that wrapper, restoring the original-only view

#### Scenario: Placeholder during translation

- **WHEN** translation of a paragraph is in progress
- **THEN** a placeholder is shown in the wrapper and is replaced by the translated text once the background worker responds

---
### Requirement: Per-paragraph failure isolation

When translation of a paragraph fails, the system SHALL show an error indication within that paragraph's wrapper and SHALL NOT affect other paragraphs or break the host page.

#### Scenario: One paragraph fails

- **WHEN** the background worker returns an error for a paragraph
- **THEN** that paragraph's wrapper shows a failure indication while previously translated paragraphs remain intact
