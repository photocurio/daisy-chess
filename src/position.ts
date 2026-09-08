import { formatSquare, parseSquare } from "./board.js"
import {
  BOARD_SIZE,
  Color,
  Move,
  Piece,
  PieceType,
  Position,
  PromotionPiece,
  SQUARE_COUNT,
} from "./types.js"

export interface Placement {
  square: string
  color: Color
  type: PieceType
}

export interface DarkFormation {
  id: string
  backRank: readonly PieceType[]
}

const PIECE_TOKEN: Record<PieceType, string> = {
  king: "k",
  queen: "q",
  rook: "r",
  bishop: "b",
  knight: "n",
  pawn: "p",
}

export const DEFAULT_DARK_BACK_RANK: readonly PieceType[] = [
  "rook", "bishop", "king", "knight", "bishop",
]

export const LIGHT_INITIAL_PLACEMENTS: readonly Placement[] = [
  { square: "b2", color: "light", type: "pawn" },
  { square: "c2", color: "light", type: "pawn" },
  { square: "d2", color: "light", type: "pawn" },
  { square: "b1", color: "light", type: "queen" },
  { square: "d1", color: "light", type: "king" },
]

export const DARK_FORMATIONS: readonly DarkFormation[] = uniquePermutations(DEFAULT_DARK_BACK_RANK)
  .filter((backRank) => {
    const bishopFiles = backRank
      .map((type, file) => type === "bishop" ? file : -1)
      .filter((file) => file >= 0)
    return bishopFiles[0]! % 2 !== bishopFiles[1]! % 2
  })
  .map((backRank) => ({ id: backRank.map((type) => PIECE_TOKEN[type]).join(""), backRank }))

export const INITIAL_PLACEMENTS: readonly Placement[] = placementsFor(DEFAULT_DARK_BACK_RANK)

export function createPosition(
  placements: readonly Placement[],
  turn: Color = "light",
): Position {
  const board: Array<Piece | null> = Array.from({ length: SQUARE_COUNT }, () => null)

  for (const placement of placements) {
    const index = parseSquare(placement.square)
    if (board[index]) throw new Error(`Two pieces occupy ${placement.square}`)
    board[index] = { color: placement.color, type: placement.type }
  }

  for (const color of ["light", "dark"] as const) {
    const kings = board.filter((piece) => piece?.color === color && piece.type === "king")
    if (kings.length !== 1) throw new Error(`Position must contain exactly one ${color} king`)
  }

  return {
    board,
    turn,
    halfmoveClock: 0,
    ply: 0,
  }
}

export function createInitialPosition(darkBackRank: readonly PieceType[] = DEFAULT_DARK_BACK_RANK): Position {
  return createPosition(placementsFor(darkBackRank))
}

export function placementsFor(darkBackRank: readonly PieceType[]): Placement[] {
  validateDarkBackRank(darkBackRank)
  return [
    ...darkBackRank.map((type, file): Placement => ({
      square: `${"abcde"[file]}5`,
      color: "dark",
      type,
    })),
    ...LIGHT_INITIAL_PLACEMENTS,
  ]
}

export function clonePosition(position: Position): Position {
  return { ...position, board: [...position.board] }
}

export function positionKey(position: Position): string {
  return `${position.turn}:${position.board.map((piece) => {
    if (!piece) return "."
    const token = PIECE_TOKEN[piece.type]
    return piece.color === "light" ? token.toUpperCase() : token
  }).join("")}`
}

export function moveToUci(move: Move): string {
  const promotion = move.promotion ? PIECE_TOKEN[move.promotion] : ""
  return `${formatSquare(move.from)}${formatSquare(move.to)}${promotion}`
}

export function renderPosition(position: Position): string {
  const rows: string[] = []
  for (let rank = BOARD_SIZE - 1; rank >= 0; rank--) {
    const cells: string[] = []
    for (let file = 0; file < BOARD_SIZE; file++) {
      const piece = position.board[rank * BOARD_SIZE + file]
      if (!piece) {
        cells.push("·")
      } else {
        const token = PIECE_TOKEN[piece.type]
        cells.push(piece.color === "light" ? token.toUpperCase() : token)
      }
    }
    rows.push(`${rank + 1}  ${cells.join(" ")}`)
  }
  rows.push("   a b c d e")
  return rows.join("\n")
}

export function promotionToken(value: string): PromotionPiece | undefined {
  const entry = Object.entries(PIECE_TOKEN)
    .find(([type, token]) => token === value && type !== "king" && type !== "pawn")
  return entry?.[0] as PromotionPiece | undefined
}

function validateDarkBackRank(backRank: readonly PieceType[]): void {
  const expected = [...DEFAULT_DARK_BACK_RANK].sort().join(",")
  if (backRank.length !== BOARD_SIZE || [...backRank].sort().join(",") !== expected) {
    throw new Error("Dark's back rank must contain a king, rook, knight, and two bishops")
  }

  const bishopFiles = backRank
    .map((type, file) => type === "bishop" ? file : -1)
    .filter((file) => file >= 0)
  if (bishopFiles[0]! % 2 === bishopFiles[1]! % 2) {
    throw new Error("Dark's bishops must begin on opposite-colored squares")
  }
}

function uniquePermutations(values: readonly PieceType[]): PieceType[][] {
  const permutations: PieceType[][] = []

  function visit(remaining: readonly PieceType[], chosen: PieceType[]): void {
    if (remaining.length === 0) {
      permutations.push(chosen)
      return
    }

    const used = new Set<PieceType>()
    for (let index = 0; index < remaining.length; index++) {
      const value = remaining[index]!
      if (used.has(value)) continue
      used.add(value)
      visit([...remaining.slice(0, index), ...remaining.slice(index + 1)], [...chosen, value])
    }
  }

  visit(values, [])
  return permutations
}
