import assert from "node:assert/strict"
import test from "node:test"

import {
  DARK_FORMATIONS,
  createInitialPosition,
  createPosition,
  gameStatus,
  generateLegalMoves,
  isInCheck,
  moveToUci,
  parseMove,
  playMove,
  renderPosition,
} from "../src/index.js"

test("Dark has 36 back ranks with opposite-colored bishops", () => {
  assert.equal(DARK_FORMATIONS.length, 36)
  assert.equal(new Set(DARK_FORMATIONS.map(({ id }) => id)).size, 36)

  for (const { backRank } of DARK_FORMATIONS) {
    const bishopFiles = backRank
      .map((piece, file) => piece === "bishop" ? file : -1)
      .filter((file) => file >= 0)
    assert.notEqual(bishopFiles[0]! % 2, bishopFiles[1]! % 2)
  }
})

test("the provisional position has five pieces per side", () => {
  const position = createInitialPosition()
  const pieces = position.board.filter((piece) => piece !== null)

  assert.equal(pieces.filter((piece) => piece.color === "light").length, 5)
  assert.equal(pieces.filter((piece) => piece.color === "dark").length, 5)
  assert.equal(isInCheck(position, "light"), false)
  assert.equal(isInCheck(position, "dark"), false)
  assert.match(renderPosition(position), /5  r b k n b/)
})

test("pawns move one square, never two", () => {
  const moves = generateLegalMoves(createInitialPosition()).map(moveToUci)

  assert.ok(moves.includes("b2b3"))
  assert.ok(moves.includes("c2c3"))
  assert.ok(moves.includes("d2d3"))
  assert.ok(!moves.includes("b2b4"))
})

test("a pinned piece may not expose its king", () => {
  const position = createPosition([
    { square: "a1", color: "light", type: "king" },
    { square: "a2", color: "light", type: "rook" },
    { square: "a5", color: "dark", type: "rook" },
    { square: "e5", color: "dark", type: "king" },
  ])
  const moves = generateLegalMoves(position).map(moveToUci)

  assert.ok(!moves.includes("a2b2"))
  assert.ok(moves.includes("a2a5"))
})

test("checkmate is distinguished from stalemate", () => {
  const checkmate = createPosition([
    { square: "c4", color: "light", type: "king" },
    { square: "b4", color: "light", type: "queen" },
    { square: "a5", color: "dark", type: "king" },
  ], "dark")

  assert.deepEqual(gameStatus(checkmate), { type: "checkmate", winner: "light" })
})

test("a king wins immediately by reaching the center", () => {
  const position = createPosition([
    { square: "b2", color: "light", type: "king" },
    { square: "e5", color: "dark", type: "king" },
  ])

  const next = playMove(position, parseMove(position, "b2c3"))

  assert.deepEqual(gameStatus(next), { type: "center", winner: "light" })
  assert.equal(generateLegalMoves(next).length, 0)
})

test("a king may not enter an attacked center square", () => {
  const position = createPosition([
    { square: "b2", color: "light", type: "king" },
    { square: "e5", color: "dark", type: "king" },
    { square: "c5", color: "dark", type: "rook" },
  ])
  const moves = generateLegalMoves(position).map(moveToUci)

  assert.ok(!moves.includes("b2c3"))
})

test("moves use compact 5x5 coordinate notation", () => {
  assert.equal(moveToUci(parseMove(createInitialPosition(), "c2c3")), "c2c3")
})
