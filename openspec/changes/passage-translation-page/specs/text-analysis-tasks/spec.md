## ADDED Requirements

### Requirement: Full-text summary task

The system SHALL provide a `summarize` task that produces a Traditional Chinese summary of the entire pasted text. The summary prompt SHALL instruct the model to output one opening sentence followed by 3–5 key points, in Traditional Chinese regardless of the source language. The summary output language SHALL NOT depend on the configured translation target language. The result SHALL stream incrementally into a dedicated result panel rendered above the input/segment area.

#### Scenario: Summarize an English article

- **WHEN** the user pastes an English article and triggers 「全文摘要」
- **THEN** the result panel streams in a Traditional Chinese summary consisting of one opening sentence and 3–5 key points

#### Scenario: Summary ignores translation target setting

- **WHEN** the configured translation target language is not Traditional Chinese and the user triggers 「全文摘要」
- **THEN** the summary is still produced in Traditional Chinese

### Requirement: Research analysis task

The system SHALL provide an `analyze` task whose system prompt sets the persona of a PhD student proficient in literature across all disciplines, and instructs the model to analyze the given text in exactly three sections in this order: 「研究背景與脈絡」, 「研究方法」, and 「文獻貢獻」. The 「文獻貢獻」 section SHALL classify the contribution as unique method, unique insight, or discovery of a unique phenomenon (multiple classifications allowed). Output SHALL be Traditional Chinese structured plain text where each section starts with its name wrapped in 【】; the prompt SHALL NOT request markdown. The result SHALL stream incrementally into the result panel.

#### Scenario: Analyze a research paper excerpt

- **WHEN** the user pastes a research paper excerpt and triggers 「研究重點剖析」
- **THEN** the result panel streams in Traditional Chinese analysis containing the sections 【研究背景與脈絡】, 【研究方法】, and 【文獻貢獻】 in that order, with the contribution section naming at least one of unique method, unique insight, or unique phenomenon

### Requirement: Analysis results rendered as preformatted text

The result panel SHALL render streamed analysis output as plain text preserving whitespace and line breaks (pre-wrap), without a markdown rendering dependency. An analysis task failure SHALL surface its error message in the result panel; cancellation SHALL clear the panel back to its pre-task state without an error.

#### Scenario: Structured plain text display

- **WHEN** an analysis task streams its output
- **THEN** the result panel displays the text with original line breaks preserved and applies no markdown transformation

#### Scenario: Analysis task fails

- **WHEN** a summary or analysis request fails
- **THEN** the result panel shows the error message and no partial result is mistaken for a completed analysis
