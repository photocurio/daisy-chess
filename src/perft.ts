import { applyMoveUnchecked, generateLegalMoves } from "./rules.js"
import { Position } from "./types.js"

export function perft(position: Position, depth: number): number {
  if (depth < 0 || !Number.isInteger(depth)) throw new Error("Depth must be a non-negative integer")
  if (depth === 0) return 1

  let nodes = 0
  for (const move of generateLegalMoves(position)) {
    nodes += perft(applyMoveUnchecked(position, move), depth - 1)
  }
  return nodes
}
