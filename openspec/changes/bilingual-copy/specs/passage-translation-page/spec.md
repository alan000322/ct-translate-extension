## ADDED Requirements

### Requirement: Bilingual copy of completed translations

The passage-translation page SHALL provide a 「雙語複製」 control in the run view that copies all completed segments as bilingual plain text to the clipboard in one action. The copied text SHALL list segments in document order, each as the original text followed on the next line by its translation, with a blank line between segments. Segments whose translation is not in `done` state SHALL be excluded. The control SHALL be enabled only when at least one segment is `done`. The copy SHALL use the page-context clipboard API within the user's click gesture, with no new manifest permission. On success the control SHALL show an inline 「已複製 ✓」 feedback for roughly two seconds before reverting; on failure it SHALL surface an error hint instead.

#### Scenario: Copy completed bilingual pairs

- **WHEN** translation has completed for some segments and the user activates 「雙語複製」
- **THEN** the clipboard contains the done segments' original-and-translation pairs in document order, separated by blank lines, and the control briefly shows 「已複製 ✓」

##### Example: format with one unfinished segment

- **GIVEN** three segments: A (done, translation 甲), B (error), C (done, translation 丙)
- **WHEN** the user activates 「雙語複製」
- **THEN** the clipboard contains exactly `"A\n甲\n\nC\n丙"` — segment B is excluded and no trailing blank line is added

#### Scenario: No completed segment

- **WHEN** no segment has reached `done` state
- **THEN** the 「雙語複製」 control is disabled and no clipboard write occurs
