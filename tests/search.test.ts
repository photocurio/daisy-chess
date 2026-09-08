import assert from "node:assert/strict"
import test from "node:test"

import {
  analyzeMoves,
  createInitialPosition,
  createPosition,
  gameStatus,
  generateLegalMoves,
  materialScore,
  moveToUci,
  playMove,
  searchBestMove,
} from "../src/index.js"

test("root analysis scores every legal opening move", () => {
  const position = createInitialPosition()
  const legalMoves = generateLegalMoves(position)
  const analyses = analyzeMoves(position, { maxDepth: 2, timeMs: 1_000 })

  assert.equal(analyses.length, legalMoves.length)
  assert.ok(analyses.every((analysis) => analysis.principalVariation[0] === analysis.move))
  assert.ok(analyses.every((analysis, index) => index === 0 || analyses[index - 1]!.score >= analysis.score))
})

test("the provisional armies use conventional material values", () => {
  const position = createPosition([
    { square: "d1", color: "light", type: "king" },
    { square: "b1", color: "light", type: "queen" },
    { square: "b2", color: "light", type: "pawn" },
    { square: "c2", color: "light", type: "pawn" },
    { square: "d2", color: "light", type: "pawn" },
    { square: "c5", color: "dark", type: "king" },
    { square: "a5", color: "dark", type: "rook" },
    { square: "b5", color: "dark", type: "bishop" },
    { square: "e5", color: "dark", type: "bishop" },
    { square: "d5", color: "dark", type: "knight" },
  ])

  assert.equal(materialScore(position, "light"), 1_200)
  assert.equal(materialScore(position, "dark"), 1_400)
})

test("the engine finds a forced mate in one", () => {
  const position = createPosition([
    { square: "c4", color: "light", type: "king" },
    { square: "b3", color: "light", type: "queen" },
    { square: "a5", color: "dark", type: "king" },
  ])
  const result = searchBestMove(position, { maxDepth: 3, timeMs: 1_000 })

  assert.ok(result.move, "expected the engine to find a move")
  const next = playMove(position, result.move)
  assert.deepEqual(gameStatus(next), { type: "checkmate", winner: "light" })
  assert.match(moveToUci(result.move), /^[a-e][1-5][a-e][1-5]$/)
})
