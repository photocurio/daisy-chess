import { offset, parseSquare, rankOf } from "./board.js"
import { clonePosition, moveToUci, promotionToken } from "./position.js"
import {
  Color,
  GameStatus,
  Move,
  Piece,
  Position,
  PromotionPiece,
  Square,
  opposite,
} from "./types.js"

const ORTHOGONAL = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const
const DIAGONAL = [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const
const KING_DIRECTIONS = [...ORTHOGONAL, ...DIAGONAL] as const
const KNIGHT_DIRECTIONS = [
  [1, 2], [2, 1], [2, -1], [1, -2],
  [-1, -2], [-2, -1], [-2, 1], [-1, 2],
] as const
const PROMOTIONS: readonly PromotionPiece[] = ["queen", "rook", "bishop", "knight"]
const CENTER_SQUARE = parseSquare("c3")

export function generateLegalMoves(position: Position): Move[] {
  if (centerWinner(position)) return []

  const moves: Move[] = []
  for (let from = 0; from < position.board.length; from++) {
    const piece = position.board[from]
    if (!piece || piece.color !== position.turn) continue

    for (const move of generatePseudoLegalMoves(position, from, piece)) {
      const next = applyMoveUnchecked(position, move)
      const king = findKing(next, piece.color)
      if (king !== null && !isSquareAttacked(next, king, opposite(piece.color))) {
        moves.push(move)
      }
    }
  }
  return moves
}

export function playMove(position: Position, move: Move): Position {
  const legal = generateLegalMoves(position)
    .find((candidate) => moveToUci(candidate) === moveToUci(move))
  if (!legal) throw new Error(`Illegal move: ${moveToUci(move)}`)
  return applyMoveUnchecked(position, legal)
}

export function parseMove(position: Position, value: string): Move {
  const match = value.toLowerCase().match(/^([a-e][1-5])([a-e][1-5])([qrbn])?$/)
  if (!match) throw new Error(`Invalid move: ${value}`)

  const promotion = match[3] ? promotionToken(match[3]) : undefined
  const requested: Move = {
    from: parseSquare(match[1]!),
    to: parseSquare(match[2]!),
    ...(promotion ? { promotion } : {}),
  }
  const legal = generateLegalMoves(position)
    .find((candidate) => moveToUci(candidate) === moveToUci(requested))
  if (!legal) throw new Error(`Illegal move: ${value}`)
  return legal
}

export function isInCheck(position: Position, color: Color = position.turn): boolean {
  const king = findKing(position, color)
  return king !== null && isSquareAttacked(position, king, opposite(color))
}

export function gameStatus(position: Position): GameStatus {
  const winner = centerWinner(position)
  if (winner) return { type: "center", winner }
  if (generateLegalMoves(position).length > 0) return { type: "ongoing" }
  return isInCheck(position)
    ? { type: "checkmate", winner: opposite(position.turn) }
    : { type: "stalemate" }
}

export function centerWinner(position: Position): Color | null {
  const piece = position.board[CENTER_SQUARE]
  return piece?.type === "king" ? piece.color : null
}

export function isSquareAttacked(position: Position, target: Square, byColor: Color): boolean {
  for (let from = 0; from < position.board.length; from++) {
    const piece = position.board[from]
    if (!piece || piece.color !== byColor) continue

    if (piece.type === "pawn") {
      const direction = piece.color === "light" ? 1 : -1
      for (const fileDelta of [-1, 1]) {
        if (offset(from, fileDelta, direction) === target) return true
      }
      continue
    }

    if (piece.type === "knight") {
      if (KNIGHT_DIRECTIONS.some(([df, dr]) => offset(from, df, dr) === target)) return true
      continue
    }

    if (piece.type === "king") {
      if (KING_DIRECTIONS.some(([df, dr]) => offset(from, df, dr) === target)) return true
      continue
    }

    const directions = piece.type === "rook"
      ? ORTHOGONAL
      : piece.type === "bishop"
        ? DIAGONAL
        : KING_DIRECTIONS
    for (const [df, dr] of directions) {
      let square = offset(from, df, dr)
      while (square !== null) {
        if (square === target) return true
        if (position.board[square]) break
        square = offset(square, df, dr)
      }
    }
  }
  return false
}

export function applyMoveUnchecked(position: Position, move: Move): Position {
  const next = clonePosition(position)
  const piece = next.board[move.from]
  if (!piece) throw new Error("Cannot move an empty square")
  const captured = next.board[move.to]

  next.board[move.from] = null
  next.board[move.to] = move.promotion ? { ...piece, type: move.promotion } : piece
  next.turn = opposite(position.turn)
  next.ply = position.ply + 1
  next.halfmoveClock = piece.type === "pawn" || captured ? 0 : position.halfmoveClock + 1
  return next
}

function generatePseudoLegalMoves(position: Position, from: Square, piece: Piece): Move[] {
  if (piece.type === "pawn") return pawnMoves(position, from, piece)
  if (piece.type === "knight") return stepMoves(position, from, piece, KNIGHT_DIRECTIONS)
  if (piece.type === "king") return stepMoves(position, from, piece, KING_DIRECTIONS)
  if (piece.type === "rook") return slidingMoves(position, from, piece, ORTHOGONAL)
  if (piece.type === "bishop") return slidingMoves(position, from, piece, DIAGONAL)
  return slidingMoves(position, from, piece, KING_DIRECTIONS)
}

function pawnMoves(position: Position, from: Square, piece: Piece): Move[] {
  const moves: Move[] = []
  const direction = piece.color === "light" ? 1 : -1
  const promotionRank = piece.color === "light" ? 4 : 0
  const forward = offset(from, 0, direction)

  if (forward !== null && !position.board[forward]) addPawnMove(moves, from, forward, promotionRank)

  for (const fileDelta of [-1, 1]) {
    const target = offset(from, fileDelta, direction)
    if (target === null) continue
    const occupant = position.board[target]
    if (occupant && occupant.color !== piece.color && occupant.type !== "king") {
      addPawnMove(moves, from, target, promotionRank)
    }
  }
  return moves
}

function addPawnMove(moves: Move[], from: Square, to: Square, promotionRank: number): void {
  if (rankOf(to) === promotionRank) {
    for (const promotion of PROMOTIONS) moves.push({ from, to, promotion })
  } else {
    moves.push({ from, to })
  }
}

function stepMoves(
  position: Position,
  from: Square,
  piece: Piece,
  directions: readonly (readonly [number, number])[],
): Move[] {
  const moves: Move[] = []
  for (const [df, dr] of directions) {
    const to = offset(from, df, dr)
    if (to === null) continue
    const occupant = position.board[to]
    if (!occupant || (occupant.color !== piece.color && occupant.type !== "king")) {
      moves.push({ from, to })
    }
  }
  return moves
}

function slidingMoves(
  position: Position,
  from: Square,
  piece: Piece,
  directions: readonly (readonly [number, number])[],
): Move[] {
  const moves: Move[] = []
  for (const [df, dr] of directions) {
    let to = offset(from, df, dr)
    while (to !== null) {
      const occupant = position.board[to]
      if (!occupant) {
        moves.push({ from, to })
      } else {
        if (occupant.color !== piece.color && occupant.type !== "king") moves.push({ from, to })
        break
      }
      to = offset(to, df, dr)
    }
  }
  return moves
}

function findKing(position: Position, color: Color): Square | null {
  const square = position.board.findIndex((piece) => piece?.color === color && piece.type === "king")
  return square === -1 ? null : square
}
