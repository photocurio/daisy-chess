export const BOARD_SIZE = 5
export const SQUARE_COUNT = BOARD_SIZE * BOARD_SIZE

export type Color = "light" | "dark"
export type PieceType = "king" | "queen" | "rook" | "bishop" | "knight" | "pawn"
export type PromotionPiece = Exclude<PieceType, "king" | "pawn">
export type Square = number

export interface Piece {
  color: Color
  type: PieceType
}

export interface Move {
  from: Square
  to: Square
  promotion?: PromotionPiece
}

export interface Position {
  board: Array<Piece | null>
  turn: Color
  halfmoveClock: number
  ply: number
}

export type GameStatus =
  | { type: "ongoing" }
  | { type: "checkmate"; winner: Color }
  | { type: "center"; winner: Color }
  | { type: "stalemate" }

export function opposite(color: Color): Color {
  return color === "light" ? "dark" : "light"
}
