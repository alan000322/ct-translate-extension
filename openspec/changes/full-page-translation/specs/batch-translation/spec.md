## ADDED Requirements

### Requirement: Batch multiple paragraphs into one request

The system SHALL combine multiple paragraph texts into a single translation request by joining them with a `%%` separator placed on its own line between paragraphs. The system SHALL split the returned translation back into per-paragraph results using the same `%%` separator and map each result to its originating paragraph in order. The split SHALL tolerate surrounding whitespace, tabs, and multiple newlines around the separator line, and a single-paragraph batch with no separator SHALL yield exactly one result.

#### Scenario: Round-trip join and split

- **WHEN** three paragraph texts are joined into one batch and the translated batch is split
- **THEN** exactly three translated segments are returned in the original order

##### Example: separator parsing variants

| Returned batch text | Parsed segments |
| ------------------- | --------------- |
| `A\n%%\nB\n%%\nC` | `["A", "B", "C"]` |
| `A\n  %%  \nB` | `["A", "B"]` |
| `A\n\n%%\n\nB` | `["A", "B"]` |
| `  A  ` (single, no separator) | `["A"]` |

### Requirement: Batch size limits

The system SHALL bound each batch by both a maximum paragraph count and a maximum character count, whichever limit is reached first, so a single request does not exceed the model's output capacity. These limits SHALL be configurable, and the system SHALL apply conservative defaults when not overridden.

#### Scenario: Batch split by paragraph count

- **GIVEN** the maximum paragraph count per batch is N
- **WHEN** more than N paragraphs are collected
- **THEN** the paragraphs are divided into multiple batches of at most N paragraphs each

#### Scenario: Batch split by character limit

- **GIVEN** the maximum character count per batch is C
- **WHEN** accumulating paragraphs into a batch would exceed C characters
- **THEN** the current batch is closed before that paragraph and a new batch is started

### Requirement: Per-batch failure isolation

The system SHALL isolate failures at the batch level. When a batch request fails, the system SHALL mark every paragraph in that batch with a failure indicator and SHALL continue processing the remaining batches. When the number of split result segments does not match the number of paragraphs sent in a batch, the system SHALL treat the entire batch as failed rather than filling translations into mismatched paragraphs.

#### Scenario: One batch fails, others succeed

- **GIVEN** a page is translated across multiple batches
- **WHEN** one batch request throws an error
- **THEN** every paragraph in the failed batch shows a failure indicator
- **AND** paragraphs in the other batches still show their translations

#### Scenario: Segment count mismatch fails the batch

- **WHEN** a batch of K paragraphs is sent and the split result has a number of segments other than K
- **THEN** the entire batch is marked as failed
- **AND** no translation is filled into any paragraph of that batch
