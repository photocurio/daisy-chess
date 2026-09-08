import {
  createInitialPosition,
  formatPrincipalVariation,
  formatScore,
  generateLegalMoves,
  moveToUci,
  perft,
  renderPosition,
  searchBestMove,
} from "./index.js"

const position = createInitialPosition()
const depth = Number(process.argv[2] ?? 6)
const timeMs = Number(process.argv[3] ?? 1_000)

console.log(renderPosition(position))
console.log(`\n${position.turn} to move`)
console.log(`Legal moves: ${generateLegalMoves(position).map(moveToUci).join(" ")}`)
console.log(`Perft: d1=${perft(position, 1)} d2=${perft(position, 2)} d3=${perft(position, 3)}`)

const result = searchBestMove(position, { maxDepth: depth, timeMs })
console.log(`\nBest move: ${result.move ? moveToUci(result.move) : "none"}`)
console.log(`Score: ${formatScore(result.score)}`)
console.log(`Depth: ${result.depth}; nodes: ${result.nodes}; time: ${result.elapsedMs.toFixed(1)}ms`)
console.log(`PV: ${formatPrincipalVariation(result.principalVariation) || "—"}`)
