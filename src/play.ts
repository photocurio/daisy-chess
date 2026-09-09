import { createInterface } from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"

import {
  Color,
  DARK_FORMATIONS,
  createInitialPosition,
  formatPrincipalVariation,
  formatScore,
  gameStatus,
  generateLegalMoves,
  moveToUci,
  parseMove,
  playMove,
  positionKey,
  renderPosition,
  searchBestMove,
} from "./index.js"

interface PlayOptions {
  humanSide: Color | null
  depth: number
  timeMs: number
  maxPlies: number
  seed: number
}

const options = readOptions(process.argv.slice(2))
const reader = options.humanSide ? createInterface({ input, output }) : null
const formation = DARK_FORMATIONS[(options.seed >>> 0) % DARK_FORMATIONS.length]!
let position = createInitialPosition(formation.backRank)
const repetitions = new Map([[positionKey(position), 1]])

console.log("Food Fight — provisional rules")
console.log(options.humanSide ? `You are ${options.humanSide}.` : "Engine self-play.")
console.log(`Dark formation: ${formation.id}; seed: ${options.seed}`)

try {
  while (true) {
    console.log(`\n${renderPosition(position)}`)
    console.log(`\n${capitalize(position.turn)} to move.`)

    const status = gameStatus(position)
    if (status.type === "checkmate") {
      console.log(`Checkmate. ${capitalize(status.winner)} wins.`)
      break
    }
    if (status.type === "center") {
      console.log(`${capitalize(status.winner)} wins by reaching c3.`)
      break
    }
    if (status.type === "stalemate") {
      console.log("Stalemate.")
      break
    }
    if ((repetitions.get(positionKey(position)) ?? 0) >= 3) {
      console.log("Stopped after a third repetition (playtest safeguard).")
      break
    }
    if (position.ply >= options.maxPlies) {
      console.log(`Stopped after ${options.maxPlies} plies (playtest safeguard).`)
      break
    }

    if (position.turn === options.humanSide) {
      const legalMoves = generateLegalMoves(position).map(moveToUci)
      let moved = false

      while (!moved) {
        const answer = (await reader!.question("Your move: ")).trim().toLowerCase()
        if (answer === "quit" || answer === "exit") {
          console.log("Game stopped.")
          process.exitCode = 0
          break
        }
        if (answer === "moves") {
          console.log(legalMoves.join(" "))
          continue
        }

        try {
          position = playMove(position, parseMove(position, answer))
          moved = true
        } catch (error) {
          console.log(error instanceof Error ? error.message : "That move is not legal.")
        }
      }
      if (!moved) break
    } else {
      const result = searchBestMove(position, {
        maxDepth: options.depth,
        timeMs: options.timeMs,
      })
      if (!result.move) {
        console.log("The engine did not complete a search in time.")
        break
      }

      console.log(
        `Engine plays ${moveToUci(result.move)} `
        + `(${formatScore(result.score)}, depth ${result.depth}, ${result.nodes} nodes)`,
      )
      if (result.principalVariation.length > 1) {
        console.log(`Expected: ${formatPrincipalVariation(result.principalVariation)}`)
      }
      position = playMove(position, result.move)
    }

    const key = positionKey(position)
    repetitions.set(key, (repetitions.get(key) ?? 0) + 1)
  }
} finally {
  reader?.close()
}

function readOptions(args: string[]): PlayOptions {
  const values = new Map<string, string>()
  for (const argument of args) {
    const match = argument.match(/^--([a-z-]+)=(.+)$/)
    if (!match) throw new Error(`Unknown option: ${argument}`)
    values.set(match[1]!, match[2]!)
  }

  const side = values.get("side") ?? "light"
  if (!(["light", "dark", "none"] as const).includes(side as Color | "none")) {
    throw new Error("--side must be light, dark, or none")
  }

  return {
    humanSide: side === "none" ? null : side as Color,
    depth: positiveInteger(values.get("depth") ?? "6", "depth"),
    timeMs: positiveInteger(values.get("time") ?? "750", "time"),
    maxPlies: positiveInteger(values.get("max-plies") ?? "200", "max-plies"),
    seed: integer(values.get("seed") ?? String(Date.now()), "seed"),
  }
}

function positiveInteger(value: string, name: string): number {
  const parsed = integer(value, name)
  if (parsed < 1) throw new Error(`--${name} must be a positive integer`)
  return parsed
}

function integer(value: string, name: string): number {
  const parsed = Number(value)
  if (!Number.isSafeInteger(parsed)) throw new Error(`--${name} must be an integer`)
  return parsed
}

function capitalize(value: string): string {
  return value[0]!.toUpperCase() + value.slice(1)
}
