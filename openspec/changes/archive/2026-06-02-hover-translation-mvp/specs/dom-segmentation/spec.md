## ADDED Requirements

### Requirement: Recursive walk and label into paragraph units

The system SHALL recursively walk a DOM subtree and label nodes with `data-ct-*` attributes. An element that contains at least one non-empty inline child node SHALL be labeled as a paragraph (the translation unit). Elements SHALL additionally be labeled as block or inline level.

#### Scenario: Element with inline text becomes a paragraph

- **WHEN** an element directly contains non-empty text or inline children
- **THEN** the walker sets the paragraph attribute on that element and marks it block or inline according to its computed display

#### Scenario: Walk identity per pass

- **WHEN** a walk pass runs
- **THEN** every walked element is tagged with the walked attribute carrying that pass's id, so a later pass can scope its queries to that id

### Requirement: Filter non-translatable nodes

The system SHALL skip walking and translating nodes that are non-content or hidden. Excluded tags SHALL include SCRIPT, STYLE, NOSCRIPT, CODE, PRE, IMG, VIDEO, AUDIO, SVG, CANVAS, IFRAME, INPUT, TEXTAREA, SELECT, and MATH. The system SHALL also skip elements that are hidden, `aria-hidden="true"`, or carry a no-translate class.

#### Scenario: Skip excluded and hidden nodes

- **WHEN** the walker encounters an excluded tag, a `display:none`/`visibility:hidden` element, an `aria-hidden="true"` element, or a `notranslate` element
- **THEN** that element and its subtree are neither labeled nor translated

##### Example: filter decisions

| Node | Walked & translated? |
| --- | --- |
| `<p>Hello world</p>` | yes |
| `<script>...</script>` | no |
| `<div aria-hidden="true">x</div>` | no |
| `<code>npm i</code>` | no |
| `<span class="notranslate">x</span>` | no |

### Requirement: Extract paragraph text content

The system SHALL extract a paragraph's text content by concatenating descendant text, preserving meaningful inline whitespace, converting BR elements to newlines, and excluding non-translatable descendants.

#### Scenario: Extract preserves inline spacing and breaks

- **WHEN** a paragraph contains inline elements separated by spaces and a BR element
- **THEN** the extracted text preserves single spaces between inline runs and converts the BR to a newline, while text inside excluded descendants is omitted
