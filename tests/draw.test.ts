import assert from "node:assert/strict"
import test from "node:test"

import { assessWinPossibility, createPosition } from "../src/index.js"

test("a direct center win remains possible", () => {
  const position = createPosition([
    { square: "c2", color: "light", type: "king" },
    { square: "e5", color: "dark", type: "king" },
  ])

  assert.equal(assessWinPossibility(position, "light", { timeMs: 1_000 }), "possible")
})

test("a completed opponent center win makes another win impossible", () => {
  const position = createPosition([
    { square: "a1", color: "light", type: "king" },
    { square: "c3", color: "dark", type: "king" },
  ])

  assert.equal(assessWinPossibility(position, "light", { timeMs: 1_000 }), "impossible")
})

test("an inconclusive search is never reported as impossible", () => {
  const position = createPosition([
    { square: "a1", color: "light", type: "king" },
    { square: "e5", color: "dark", type: "king" },
  ])

  assert.equal(assessWinPossibility(position, "light", { maxNodes: 1, timeMs: 1_000 }), "unknown")
})
