// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest"
import { findNearestBlockFrom } from "./node-translation"

beforeEach(() => {
  document.body.innerHTML = ""
})

describe("find nearest block paragraph from a point", () => {
  it("resolves an inline child up to its enclosing block paragraph", () => {
    document.body.innerHTML = `<article><p id="p">Lead <span id="s">inline word</span> tail</p></article>`
    const result = findNearestBlockFrom(document.getElementById("s"))
    expect(result?.id).toBe("p")
    expect(result?.tagName).toBe("P")
  })

  it("returns null when there is no block ancestor", () => {
    expect(findNearestBlockFrom(null)).toBeNull()
  })
})
