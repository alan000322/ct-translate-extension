## ADDED Requirements

### Requirement: Main-content scope detection

The system SHALL determine which page blocks to translate by identifying the page's main article content and excluding navigation, sidebars, footers, and ads. The system SHALL use the Defuddle library on a snapshot of the document to identify the main-content region, then resolve that region to a live DOM root element. When Defuddle parsing fails or no main-content root can be resolved, the system SHALL fall back to the document body so translation still proceeds.

#### Scenario: Article body identified, chrome excluded

- **WHEN** the user triggers full-page translation on a page containing a navigation bar, a sidebar, an article body, and a footer
- **THEN** only paragraphs inside the resolved main-content root are collected for translation
- **AND** paragraphs inside the navigation, sidebar, and footer are not translated

#### Scenario: Defuddle failure falls back to body

- **WHEN** Defuddle parsing throws or yields no resolvable main-content root
- **THEN** the system logs a warning and uses the document body as the translation root
- **AND** full-page translation still proceeds over the body's paragraphs

### Requirement: Per-paragraph fill-back display

The system SHALL collect the paragraph units (the existing paragraph-marked elements) within the main-content root and display each translation in bilingual mode, inserting the translated text below the original paragraph. The system SHALL insert a pending placeholder for each paragraph before its batch returns and SHALL fill each paragraph's translation back into its own node as each batch completes, so translations appear progressively per paragraph. The system SHALL NOT use character-by-character streaming for full-page translation.

#### Scenario: Translations appear progressively per paragraph

- **WHEN** full-page translation runs over multiple paragraphs split across batches
- **THEN** each paragraph first shows a pending placeholder
- **AND** each paragraph's translated text is filled in below its original text when the batch containing that paragraph returns

#### Scenario: Bilingual layout preserved

- **WHEN** a paragraph's translation is filled in
- **THEN** the original text remains and the translation is shown below it, matching the existing hover bilingual behavior

### Requirement: Two triggers distinct from hover hotkey

The system SHALL provide two ways to trigger full-page translation: a button in the popup and a configurable keyboard shortcut. The full-page keyboard shortcut SHALL be distinct from the hover hotkey (holding a single modifier Control/Alt/Shift for 80ms) so the two modes do not conflict. The keyboard shortcut SHALL NOT trigger while focus is in an input, textarea, or contenteditable element.

#### Scenario: Popup button triggers full-page translation

- **WHEN** the user clicks the full-page translate button in the popup
- **THEN** the active tab's main content is translated

#### Scenario: Keyboard shortcut triggers full-page translation

- **WHEN** the user presses the configured full-page shortcut on a page
- **THEN** the page's main content is translated
- **AND** the hover single-paragraph behavior is not triggered by that shortcut

#### Scenario: Shortcut ignored in editable fields

- **WHEN** focus is in an input, textarea, or contenteditable element and the user presses the full-page shortcut
- **THEN** full-page translation is not triggered

### Requirement: Whole-page toggle undo

The system SHALL support undoing the whole-page translation by triggering again (via the popup button or the keyboard shortcut). Triggering again SHALL remove all inserted translation wrappers within the main-content root and restore the original page, mirroring the existing hover undo behavior.

#### Scenario: Second trigger restores original page

- **GIVEN** the page's main content has been translated
- **WHEN** the user triggers full-page translation again
- **THEN** all inserted translations within the main-content root are removed
- **AND** the page shows only the original text

### Requirement: Snapshot semantics

The system SHALL translate the page as it exists at trigger time. The system SHALL collect the paragraph set once when triggered and SHALL NOT watch for dynamically added content via MutationObserver or IntersectionObserver.

#### Scenario: Content added after trigger is not translated

- **GIVEN** full-page translation has been triggered and completed
- **WHEN** new content is added to the page afterwards by the site
- **THEN** the newly added content is not automatically translated
