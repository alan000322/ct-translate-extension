// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest"
import { walkAndLabelElement, extractTextContent } from "./traversal"
import {
  BLOCK_ATTRIBUTE,
  INLINE_ATTRIBUTE,
  PARAGRAPH_ATTRIBUTE,
  WALKED_ATTRIBUTE,
} from "./labels"

beforeEach(() => {
  document.body.innerHTML = ""
})

describe("recursive walk and label into paragraph units", () => {
  it("labels a paragraph, its block level, and an inline child", () => {
    document.body.innerHTML
      = `<div id="wrap"><p id="p1">Hello <span id="s1" style="display:inline">brave</span> world</p></div>`
    const wrap = document.getElementById("wrap")!

    walkAndLabelElement(wrap, "w1")

    expect(wrap.getAttribute(WALKED_ATTRIBUTE)).toBe("w1")
    const p1 = document.getElementById("p1")!
    expect(p1.hasAttribute(PARAGRAPH_ATTRIBUTE)).toBe(true)
    expect(p1.hasAttribute(BLOCK_ATTRIBUTE)).toBe(true)
    expect(document.getElementById("s1")!.hasAttribute(INLINE_ATTRIBUTE)).toBe(true)
  })
})

describe("filter non-translatable nodes", () => {
  it("does not walk excluded, hidden, aria-hidden, code, or notranslate nodes", () => {
    document.body.innerHTML = `<div id="c">`
      + `<script id="sc">var x=1</script>`
      + `<div id="hid" style="display:none">hidden</div>`
      + `<div id="ah" aria-hidden="true">aria</div>`
      + `<code id="cd">code</code>`
      + `<span id="nt" class="notranslate">nt</span>`
      + `<p id="ok">visible text here</p>`
      + `</div>`
    walkAndLabelElement(document.getElementById("c")!, "w2")

    for (const id of ["sc", "hid", "ah", "cd", "nt"]) {
      expect(document.getElementById(id)!.hasAttribute(WALKED_ATTRIBUTE)).toBe(false)
    }
    const ok = document.getElementById("ok")!
    expect(ok.hasAttribute(PARAGRAPH_ATTRIBUTE)).toBe(true)
    expect(ok.hasAttribute(BLOCK_ATTRIBUTE)).toBe(true)
  })
})

describe("extract paragraph text content", () => {
  it("preserves inline spacing, converts BR to newline, omits excluded descendants", () => {
    document.body.innerHTML
      = `<p id="t">Hello <span>brave</span> world<br><code>ignored</code>End</p>`
    const result = extractTextContent(document.getElementById("t")!)
    expect(result).toBe("Hello brave world\nEnd")
  })
})
