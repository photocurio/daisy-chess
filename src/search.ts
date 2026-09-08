import { fileOf, rankOf } from "./board.js"
import { moveToUci, positionKey } from "./position.js"
import {
  applyMoveUnchecked,
  centerWinner,
  generateLegalMoves,
  isInCheck,
} from "./rules.js"
import { Color, Move, PieceType, Position } from "./types.js"

const MATE_SCORE = 100_000
const INFINITY = 1_000_000
const KING_CENTER_STEP_VALUE = 80
const PIECE_VALUE: Record<PieceType, number> = {
  king: 0,
  queen: 900,
  rook: 500,
  bishop: 300,
  knight: 300,
  pawn: 100,
}

export interface SearchOptions {
  maxDepth?: number
  timeMs?: number
}

export interface SearchResult {
  move: Move | null
  score: number
  depth: number
  nodes: number
  principalVariation: Move[]
  elapsedMs: number
}

export interface MoveAnalysis {
  move: Move
  score: number
  depth: number
  nodes: number
  principalVariation: Move[]
}

interface SearchContext {
  deadline: number
  nodes: number
  path: Set<string>
}

class SearchTimeout extends Error {}

export function searchBestMove(position: Position, options: SearchOptions = {}): SearchResult {
  const started = performance.now()
  const maxDepth = Math.max(1, options.maxDepth ?? 6)
  const timeMs = Math.max(1, options.timeMs ?? 250)
  const context: SearchContext = {
    deadline: started + timeMs,
    nodes: 0,
    path: new Set([positionKey(position)]),
  }

  let bestMove: Move | null = null
  let bestScore = 0
  let bestLine: Move[] = []
  let completedDepth = 0

  for (let depth = 1; depth <= maxDepth; depth++) {
    try {
      const result = negamax(position, depth, -INFINITY, INFINITY, 0, context)
      bestMove = result.line[0] ?? null
      bestScore = result.score
      bestLine = result.line
      completedDepth = depth
      if (Math.abs(bestScore) >= MATE_SCORE - 100) break
    } catch (error) {
      if (!(error instanceof SearchTimeout)) throw error
      break
    }
  }

  return {
    move: bestMove,
    score: bestScore,
    depth: completedDepth,
    nodes: context.nodes,
    principalVariation: bestLine,
    elapsedMs: performance.now() - started,
  }
}

export function analyzeMoves(position: Position, options: SearchOptions = {}): MoveAnalysis[] {
  const started = performance.now()
  const depth = Math.max(1, options.maxDepth ?? 3)
  const timeMs = Math.max(1, options.timeMs ?? 1_000)
  const deadline = started + timeMs
  const analyses: MoveAnalysis[] = []

  for (const move of orderMoves(position, generateLegalMoves(position))) {
    const next = applyMoveUnchecked(position, move)
    const context: SearchContext = {
      deadline,
      nodes: 0,
      path: new Set([positionKey(position), positionKey(next)]),
    }

    try {
      const child = negamax(next, depth - 1, -INFINITY, INFINITY, 1, context)
      analyses.push({
        move,
        score: -child.score,
        depth,
        nodes: context.nodes,
        principalVariation: [move, ...child.line],
      })
    } catch (error) {
      if (!(error instanceof SearchTimeout)) throw error
      break
    }
  }

  return analyses.sort((left, right) => right.score - left.score)
}

function negamax(
  position: Position,
  depth: number,
  alphaValue: number,
  beta: number,
  ply: number,
  context: SearchContext,
): { score: number; line: Move[] } {
  if ((context.nodes & 255) === 0 && performance.now() >= context.deadline) {
    throw new SearchTimeout()
  }
  context.nodes++

  const winner = centerWinner(position)
  if (winner) {
    return {
      score: winner === position.turn ? MATE_SCORE - ply : -MATE_SCORE + ply,
      line: [],
    }
  }

  const moves = generateLegalMoves(position)
  if (moves.length === 0) {
    return {
      score: isInCheck(position) ? -MATE_SCORE + ply : 0,
      line: [],
    }
  }
  if (depth === 0) return { score: evaluate(position), line: [] }

  let alpha = alphaValue
  let bestScore = -INFINITY
  let bestLine: Move[] = []

  for (const move of orderMoves(position, moves)) {
    const next = applyMoveUnchecked(position, move)
    const key = positionKey(next)
    if (context.path.has(key)) {
      if (0 > bestScore) {
        bestScore = 0
        bestLine = [move]
      }
      alpha = Math.max(alpha, 0)
      if (alpha >= beta) break
      continue
    }

    context.path.add(key)
    const child = negamax(next, depth - 1, -beta, -alpha, ply + 1, context)
    context.path.delete(key)
    const score = -child.score

    if (score > bestScore) {
      bestScore = score
      bestLine = [move, ...child.line]
    }
    alpha = Math.max(alpha, score)
    if (alpha >= beta) break
  }

  return { score: bestScore, line: bestLine }
}

function evaluate(position: Position): number {
  let lightScore = 0
  let darkScore = 0

  for (let square = 0; square < position.board.length; square++) {
    const piece = position.board[square]
    if (!piece) continue

    let value = PIECE_VALUE[piece.type]
    if (piece.type === "king") {
      const centralDistance = Math.abs(fileOf(square) - 2) + Math.abs(rankOf(square) - 2)
      value += (4 - centralDistance) * KING_CENTER_STEP_VALUE
    } else if (piece.type === "pawn") {
      const progress = piece.color === "light" ? rankOf(square) - 1 : 3 - rankOf(square)
      value += Math.max(0, progress) * 35
    } else {
      const centralDistance = Math.abs(fileOf(square) - 2) + Math.abs(rankOf(square) - 2)
      value += Math.max(0, 4 - centralDistance) * 4
    }

    if (piece.color === "light") lightScore += value
    else darkScore += value
  }

  const absolute = lightScore - darkScore
  return position.turn === "light" ? absolute : -absolute
}

function orderMoves(position: Position, moves: Move[]): Move[] {
  return [...moves].sort((left, right) => movePriority(position, right) - movePriority(position, left))
}

function movePriority(position: Position, move: Move): number {
  const moving = position.board[move.from]
  const captured = position.board[move.to]
  let score = move.promotion ? PIECE_VALUE[move.promotion] + 1_000 : 0
  if (captured) score += 10 * PIECE_VALUE[captured.type] - PIECE_VALUE[moving?.type ?? "pawn"]

  const next = applyMoveUnchecked(position, move)
  if (isInCheck(next, next.turn)) score += 500
  return score
}

export function formatScore(score: number): string {
  if (score >= MATE_SCORE - 1_000) return `mate +${MATE_SCORE - score}`
  if (score <= -MATE_SCORE + 1_000) return `mate -${MATE_SCORE + score}`
  return `${score >= 0 ? "+" : ""}${(score / 100).toFixed(2)}`
}

export function formatPrincipalVariation(moves: readonly Move[]): string {
  return moves.map(moveToUci).join(" ")
}

export function scoreFor(position: Position, color: Color): number {
  const score = evaluate(position)
  return position.turn === color ? score : -score
}

export function materialScore(position: Position, color: Color): number {
  return position.board.reduce(
    (total, piece) => total + (piece?.color === color ? PIECE_VALUE[piece.type] : 0),
    0,
  )
}
