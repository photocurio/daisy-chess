import { mkdir, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

import {
  DARK_FORMATIONS,
  DEFAULT_DARK_BACK_RANK,
  DarkFormation,
  MoveAnalysis,
  analyzeMoves,
  createInitialPosition,
  gameStatus,
  moveToUci,
  playMove,
  positionKey,
} from "./index.js"

type Result = "light_win" | "dark_win" | "draw"
type Termination = "checkmate" | "center" | "stalemate" | "threefold" | "max_plies"

interface TournamentOptions {
  games: number
  formations: "default" | "random" | "all"
  gamesPerFormation: number
  depth: number
  temperature: number
  seed: number
  maxPlies: number
}

interface GameRecord {
  game: number
  darkFormation: string
  lightOpening: string
  darkOpening: string
  plies: number
  fullMoves: number
  result: Result
  termination: Termination
  moves: string[]
}

interface OpeningSummary {
  opening: string
  games: number
  lightWins: number
  darkWins: number
  draws: number
  averagePlies: number
}

interface FormationSummary {
  formation: string
  games: number
  lightWins: number
  darkWins: number
  draws: number
  averagePlies: number
}

const options = readOptions(process.argv.slice(2))
const random = mulberry32(options.seed)
const games: GameRecord[] = []
const started = performance.now()
const defaultFormation = DARK_FORMATIONS.find(({ backRank }) =>
  backRank.every((piece, index) => piece === DEFAULT_DARK_BACK_RANK[index]))!
const schedule = createSchedule(options, random, defaultFormation)

console.log(
  `Running ${schedule.length} games across ${new Set(schedule.map(({ id }) => id)).size} formation(s) `
  + `at depth ${options.depth} `
  + `(temperature ${options.temperature}, seed ${options.seed})...`,
)

for (let index = 0; index < schedule.length; index++) {
  games.push(playGame(index + 1, schedule[index]!, options, random))
  if ((index + 1) % 20 === 0 || index + 1 === schedule.length) {
    console.log(`Completed ${index + 1}/${schedule.length}`)
  }
}

const summary = summarize(games)
const durationMs = performance.now() - started
const timestamp = new Date().toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z")
const resultsDirectory = resolve("results")
const baseName = `tournament-${timestamp}`
const jsonPath = resolve(resultsDirectory, `${baseName}.json`)
const csvPath = resolve(resultsDirectory, `${baseName}.csv`)

await mkdir(resultsDirectory, { recursive: true })
await writeFile(jsonPath, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  durationMs,
  options,
  summary,
  games,
}, null, 2)}\n`)
await writeFile(csvPath, toCsv(games))

console.log("\nResults")
console.log(`Light wins: ${summary.lightWins}; Dark wins: ${summary.darkWins}; Draws: ${summary.draws}`)
console.log(
  `Length: average ${summary.averagePlies.toFixed(1)} plies; `
  + `median ${summary.medianPlies}; range ${summary.minimumPlies}–${summary.maximumPlies}`,
)
console.log(`Formations tested: ${summary.formations.length}`)
console.log("\nLight openings")
for (const opening of summary.openings) {
  console.log(
    `${opening.opening.padEnd(6)} ${String(opening.games).padStart(3)} games; `
    + `L ${opening.lightWins}, D ${opening.darkWins}, draw ${opening.draws}; `
    + `${opening.averagePlies.toFixed(1)} average plies`,
  )
}
console.log(`\nSaved ${jsonPath}`)
console.log(`Saved ${csvPath}`)

function playGame(
  gameNumber: number,
  formation: DarkFormation,
  playOptions: TournamentOptions,
  randomValue: () => number,
): GameRecord {
  let position = createInitialPosition(formation.backRank)
  const moves: string[] = []
  const repetitions = new Map([[positionKey(position), 1]])
  let result: Result = "draw"
  let termination: Termination = "max_plies"

  while (position.ply < playOptions.maxPlies) {
    const status = gameStatus(position)
    if (status.type === "checkmate") {
      result = status.winner === "light" ? "light_win" : "dark_win"
      termination = "checkmate"
      break
    }
    if (status.type === "center") {
      result = status.winner === "light" ? "light_win" : "dark_win"
      termination = "center"
      break
    }
    if (status.type === "stalemate") {
      termination = "stalemate"
      break
    }
    if ((repetitions.get(positionKey(position)) ?? 0) >= 3) {
      termination = "threefold"
      break
    }

    const analyses = analyzeMoves(position, {
      maxDepth: playOptions.depth,
      timeMs: 5_000,
    })
    if (analyses.length === 0) {
      throw new Error(`Game ${gameNumber}: move analysis timed out before scoring a move`)
    }

    const selected = chooseMove(analyses, playOptions.temperature, randomValue)
    moves.push(moveToUci(selected.move))
    position = playMove(position, selected.move)
    const key = positionKey(position)
    repetitions.set(key, (repetitions.get(key) ?? 0) + 1)
  }

  return {
    game: gameNumber,
    darkFormation: formation.id,
    lightOpening: moves[0] ?? "",
    darkOpening: moves[1] ?? "",
    plies: position.ply,
    fullMoves: Math.ceil(position.ply / 2),
    result,
    termination,
    moves,
  }
}

function chooseMove(
  analyses: readonly MoveAnalysis[],
  temperature: number,
  randomValue: () => number,
): MoveAnalysis {
  if (temperature === 0 || analyses.length === 1) return analyses[0]!

  const bestScore = analyses[0]!.score
  const weights = analyses.map(({ score }) => Math.exp(Math.max(-20, (score - bestScore) / temperature)))
  const total = weights.reduce((sum, weight) => sum + weight, 0)
  let target = randomValue() * total

  for (let index = 0; index < analyses.length; index++) {
    target -= weights[index]!
    if (target <= 0) return analyses[index]!
  }
  return analyses.at(-1)!
}

function summarize(gamesPlayed: readonly GameRecord[]) {
  const plies = gamesPlayed.map(({ plies: length }) => length).sort((a, b) => a - b)
  const openings = new Map<string, GameRecord[]>()
  const formations = new Map<string, GameRecord[]>()
  for (const game of gamesPlayed) {
    const records = openings.get(game.lightOpening) ?? []
    records.push(game)
    openings.set(game.lightOpening, records)

    const formationRecords = formations.get(game.darkFormation) ?? []
    formationRecords.push(game)
    formations.set(game.darkFormation, formationRecords)
  }

  return {
    games: gamesPlayed.length,
    lightWins: countResult(gamesPlayed, "light_win"),
    darkWins: countResult(gamesPlayed, "dark_win"),
    draws: countResult(gamesPlayed, "draw"),
    averagePlies: average(plies),
    medianPlies: median(plies),
    minimumPlies: plies[0] ?? 0,
    maximumPlies: plies.at(-1) ?? 0,
    openings: [...openings.entries()]
      .map(([opening, records]): OpeningSummary => ({
        opening,
        games: records.length,
        lightWins: countResult(records, "light_win"),
        darkWins: countResult(records, "dark_win"),
        draws: countResult(records, "draw"),
        averagePlies: average(records.map(({ plies: length }) => length)),
      }))
      .sort((left, right) => right.games - left.games || left.opening.localeCompare(right.opening)),
    formations: [...formations.entries()]
      .map(([formation, records]): FormationSummary => ({
        formation,
        games: records.length,
        lightWins: countResult(records, "light_win"),
        darkWins: countResult(records, "dark_win"),
        draws: countResult(records, "draw"),
        averagePlies: average(records.map(({ plies: length }) => length)),
      }))
      .sort((left, right) => left.formation.localeCompare(right.formation)),
  }
}

function countResult(gamesPlayed: readonly GameRecord[], result: Result): number {
  return gamesPlayed.filter((game) => game.result === result).length
}

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0
  const middle = Math.floor(values.length / 2)
  return values.length % 2 === 0
    ? (values[middle - 1]! + values[middle]!) / 2
    : values[middle]!
}

function toCsv(gamesPlayed: readonly GameRecord[]): string {
  const rows = [
    ["game", "dark_formation", "light_opening", "dark_opening", "plies", "full_moves", "result", "termination", "moves"],
    ...gamesPlayed.map((game) => [
      game.game,
      game.darkFormation,
      game.lightOpening,
      game.darkOpening,
      game.plies,
      game.fullMoves,
      game.result,
      game.termination,
      game.moves.join(" "),
    ]),
  ]
  return `${rows.map((row) => row.map(csvCell).join(",")).join("\n")}\n`
}

function csvCell(value: string | number): string {
  const text = String(value)
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function readOptions(args: string[]): TournamentOptions {
  const values = new Map<string, string>()
  for (const argument of args) {
    const match = argument.match(/^--([a-z-]+)=(.+)$/)
    if (!match) throw new Error(`Unknown option: ${argument}`)
    values.set(match[1]!, match[2]!)
  }

  return {
    games: positiveInteger(values.get("games") ?? "100", "games"),
    formations: formationMode(values.get("formations") ?? "random"),
    gamesPerFormation: positiveInteger(
      values.get("games-per-formation") ?? "10",
      "games-per-formation",
    ),
    depth: positiveInteger(values.get("depth") ?? "3", "depth"),
    temperature: nonNegativeNumber(values.get("temperature") ?? "75", "temperature"),
    seed: integer(values.get("seed") ?? "20260907", "seed"),
    maxPlies: positiveInteger(values.get("max-plies") ?? "100", "max-plies"),
  }
}

function createSchedule(
  tournamentOptions: TournamentOptions,
  randomValue: () => number,
  defaultValue: DarkFormation,
): DarkFormation[] {
  if (tournamentOptions.formations === "all") {
    return DARK_FORMATIONS.flatMap((formation) =>
      Array.from({ length: tournamentOptions.gamesPerFormation }, () => formation))
  }
  if (tournamentOptions.formations === "default") {
    return Array.from({ length: tournamentOptions.games }, () => defaultValue)
  }
  return Array.from(
    { length: tournamentOptions.games },
    () => DARK_FORMATIONS[Math.floor(randomValue() * DARK_FORMATIONS.length)]!,
  )
}

function formationMode(value: string): TournamentOptions["formations"] {
  if (value === "default" || value === "random" || value === "all") return value
  throw new Error("--formations must be default, random, or all")
}

function positiveInteger(value: string, name: string): number {
  const parsed = integer(value, name)
  if (parsed < 1) throw new Error(`--${name} must be positive`)
  return parsed
}

function nonNegativeNumber(value: string, name: string): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`--${name} must be non-negative`)
  return parsed
}

function integer(value: string, name: string): number {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) throw new Error(`--${name} must be an integer`)
  return parsed
}

function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state += 0x6d2b79f5
    let value = state
    value = Math.imul(value ^ value >>> 15, value | 1)
    value ^= value + Math.imul(value ^ value >>> 7, value | 61)
    return ((value ^ value >>> 14) >>> 0) / 4_294_967_296
  }
}
