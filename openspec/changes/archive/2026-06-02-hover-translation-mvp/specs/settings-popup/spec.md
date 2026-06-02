## ADDED Requirements

### Requirement: Config schema and persistent storage

The system SHALL define a configuration schema validated with zod and persist it in `chrome.storage.local`, shared across content script, background worker, and popup. Configuration SHALL include language source/target codes, a list of provider configurations, the active provider id, and the node-translation hotkey.

#### Scenario: Config persists across sessions

- **WHEN** the user changes settings in the popup and reopens it later
- **THEN** the popup displays the previously saved values read from `chrome.storage.local`

#### Scenario: Config read at trigger time

- **WHEN** a paragraph translation is triggered
- **THEN** the current config is read fresh from storage so popup changes take effect without reloading the page

### Requirement: Provider and model selection

The popup SHALL let the user choose the active provider from OpenAI, Claude, Gemini, and Google Translate. For LLM providers, the popup SHALL show an API key field and a model dropdown populated from the provider's model list. For Google Translate, the popup SHALL NOT require an API key or model.

#### Scenario: Select an LLM provider

- **WHEN** the user selects OpenAI, Claude, or Gemini
- **THEN** the popup shows an API key field and a model dropdown listing that provider's available models

#### Scenario: Select Google Translate

- **WHEN** the user selects Google Translate
- **THEN** the popup hides the API key field and model dropdown, and translation works without a key

### Requirement: Target language selection with auto source

The popup SHALL let the user set the target language to Traditional Chinese (default), Japanese, or English. The source language SHALL default to auto-detect.

#### Scenario: Default target and source

- **WHEN** the extension is first installed
- **THEN** the target language defaults to Traditional Chinese and the source language defaults to auto-detect

#### Scenario: Change target language

- **WHEN** the user sets the target language to Japanese
- **THEN** subsequent translations produce Japanese output and the choice persists across popup sessions
