import { BOARD_SIZE, Square } from "./types.js"

const FILES = "abcde"

export function square(file: number, rank: number): Square {
  if (file < 0 || file >= BOARD_SIZE || rank < 0 || rank >= BOARD_SIZE) {
    throw new Error(`Square is outside the ${BOARD_SIZE}x${BOARD_SIZE} board`)
  }
  return rank * BOARD_SIZE + file
}

export function fileOf(value: Square): number {
  return value % BOARD_SIZE
}

export function rankOf(value: Square): number {
  return Math.floor(value / BOARD_SIZE)
}

export function parseSquare(value: string): Square {
  if (!/^[a-e][1-5]$/.test(value)) throw new Error(`Invalid square: ${value}`)
  return square(FILES.indexOf(value[0]!), Number(value[1]) - 1)
}

export function formatSquare(value: Square): string {
  const file = FILES[fileOf(value)]
  if (!file || value < 0 || value >= BOARD_SIZE * BOARD_SIZE) {
    throw new Error(`Invalid square index: ${value}`)
  }
  return `${file}${rankOf(value) + 1}`
}

export function offset(value: Square, fileDelta: number, rankDelta: number): Square | null {
  const file = fileOf(value) + fileDelta
  const rank = rankOf(value) + rankDelta
  return file >= 0 && file < BOARD_SIZE && rank >= 0 && rank < BOARD_SIZE
    ? square(file, rank)
    : null
}
