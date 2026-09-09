import { positionKey } from "./position.js"
import { applyMoveUnchecked, centerWinner, generateLegalMoves, isInCheck } from "./rules.js"
import { Color, Position, opposite } from "./types.js"

export type WinPossibility = "possible" | "impossible" | "unknown"

export interface WinPossibilityOptions {
  maxNodes?: number
  timeMs?: number
}

/**
 * Conservatively checks whether any legal continuation can produce a win for
 * the requested color. Resource limits return "unknown", never "impossible",
 * so an inconclusive draw offer cannot be accepted accidentally.
 */
export function assessWinPossibility(
  position: Position,
  color: Color,
  options: WinPossibilityOptions = {},
): WinPossibility {
  const maxNodes = Math.max(1, options.maxNodes ?? 25_000)
  const deadline = performance.now() + Math.max(1, options.timeMs ?? 150)
  const pending: Position[] = [position]
  const visited = new Set<string>()
  let cursor = 0

  while (cursor < pending.length) {
    if (visited.size >= maxNodes || performance.now() >= deadline) return "unknown"

    const current = pending[cursor++]!
    const key = positionKey(current)
    if (visited.has(key)) continue
    visited.add(key)

    const center = centerWinner(current)
    if (center) {
      if (center === color) return "possible"
      continue
    }

    const moves = generateLegalMoves(current)
    if (moves.length === 0) {
      if (isInCheck(current) && opposite(current.turn) === color) return "possible"
      continue
    }

    for (const move of moves) {
      const next = applyMoveUnchecked(current, move)
      if (!visited.has(positionKey(next))) pending.push(next)
    }
  }

  return "impossible"
}
