import "./styles.css"

import { formatSquare } from "../board.js"
import {
  DARK_FORMATIONS,
  createInitialPosition,
  moveToUci,
  positionKey,
} from "../position.js"
import {
  gameStatus,
  generateLegalMoves,
  isInCheck,
  parseMove,
  playMove,
} from "../rules.js"
import {
  Color,
  GameStatus,
  Move,
  Piece,
  PieceType,
  Position,
  PromotionPiece,
} from "../types.js"

type DisplayStatus = GameStatus | { type: "repetition" }

interface HistoryEntry {
  color: Color
  move: Move
  captured: Piece | null
}

interface EngineResult {
  move: Move | null
  score: number
  depth: number
  nodes: number
  elapsedMs: number
}

interface EngineResponse {
  type: "result" | "error"
  requestId: number
  result?: EngineResult
  message?: string
}

const PIECE_GLYPH: Record<Color, Record<PieceType, string>> = {
  light: {
    king: "♔",
    queen: "♕",
    rook: "♖",
    bishop: "♗",
    knight: "♘",
    pawn: "♙",
  },
  dark: {
    king: "♚",
    queen: "♛",
    rook: "♜",
    bishop: "♝",
    knight: "♞",
    pawn: "♟",
  },
}

const PIECE_ENVELOPE_GLYPH: Record<PieceType, string> = {
  king: "\uE254",
  queen: "\uE255",
  rook: "\uE256",
  bishop: "\uE257",
  knight: "\uE258",
  pawn: "\uE259",
}

const PIECE_NAME: Record<PieceType, string> = {
  king: "King",
  queen: "Queen",
  rook: "Rook",
  bishop: "Bishop",
  knight: "Knight",
  pawn: "Pawn",
}

const CENTER_SQUARE = 12
const ENGINE_PRESET = { maxDepth: 6, timeMs: 300 }

const app = document.querySelector<HTMLDivElement>("#app")
if (!app) throw new Error("App mount point was not found")

app.innerHTML = `
  <main class="game-shell">
    <header class="masthead">
      <div class="game-title">
        <strong>Barroom Brawl</strong>
        <small>Five-by-five chess</small>
      </div>
      <button class="icon-button" id="rules-button" type="button" aria-expanded="false" aria-controls="rules-card">
        <span aria-hidden="true">?</span><span class="button-label">How to play</span>
      </button>
    </header>

    <section class="play-layout" aria-label="Barroom Brawl game">
      <div class="board-stage">
        <p class="player-strip player-strip--opponent" id="opponent-strip">House plays dark pieces</p>
        <div class="board-wrap">
          <div class="board" id="board" role="grid" aria-label="Barroom Brawl board"></div>
          <div class="board-thinking" id="board-thinking" aria-hidden="true">
            <span></span><span></span><span></span>
          </div>
        </div>
        <p class="player-strip" id="player-strip">You play light pieces</p>
      </div>

      <aside class="match-panel">
        <section class="match-card">
          <div class="turn-callout" id="turn-callout" role="status" aria-live="polite">
            <span class="turn-pip"></span>
            <div><strong>Your move</strong><small>Select a piece to see its legal moves.</small></div>
          </div>

          <div class="match-actions">
            <button class="primary-button" id="new-game" type="button">Resign and try again</button>
          </div>
        </section>

        <section class="rules-card" id="rules-card" hidden>
          <div class="rules-title"><span class="target-icon">◎</span><h2>Two ways to win</h2></div>
          <ol>
            <li><span>01</span><p><strong>Checkmate the king</strong>Pieces move as they do in chess.</p></li>
            <li><span>02</span><p><strong>Claim the center</strong>Move your king safely onto c3.</p></li>
          </ol>
          <p class="rules-note">No castling, en passant, or two-square pawn moves. Pawns promote on the back rank.</p>
        </section>
      </aside>
    </section>
  </main>

  <dialog class="side-dialog" id="side-dialog" aria-labelledby="side-dialog-title">
    <form method="dialog">
      <span class="eyebrow">New game</span>
      <h2 id="side-dialog-title">Choose the light or dark pieces</h2>
      <div class="side-options">
        <button type="button" data-side-choice="light">Play light</button>
        <button type="button" data-side-choice="dark">Play dark</button>
      </div>
    </form>
  </dialog>

  <dialog class="promotion-dialog" id="promotion-dialog">
    <form method="dialog">
      <span class="eyebrow">Pawn promotion</span>
      <h2>Choose your piece</h2>
      <div class="promotion-options" id="promotion-options"></div>
      <button class="dialog-cancel" value="cancel">Cancel</button>
    </form>
  </dialog>
`

const boardElement = requireElement<HTMLDivElement>("board")
const thinkingElement = requireElement<HTMLDivElement>("board-thinking")
const turnCallout = requireElement<HTMLDivElement>("turn-callout")
const newGameButton = requireElement<HTMLButtonElement>("new-game")
const opponentStrip = requireElement<HTMLParagraphElement>("opponent-strip")
const playerStrip = requireElement<HTMLParagraphElement>("player-strip")
const rulesButton = requireElement<HTMLButtonElement>("rules-button")
const rulesCard = requireElement<HTMLElement>("rules-card")
const sideDialog = requireElement<HTMLDialogElement>("side-dialog")
const promotionDialog = requireElement<HTMLDialogElement>("promotion-dialog")
const promotionOptions = requireElement<HTMLDivElement>("promotion-options")

const engine = new Worker(new URL("./engine.worker.ts", import.meta.url), { type: "module" })

let humanColor: Color = "light"
let position: Position
let formationId = ""
let selectedSquare: number | null = null
let lastMove: Move | null = null
let history: HistoryEntry[] = []
let snapshots: Position[] = []
let thinking = false
let engineRequestId = 0
let shouldAnimateLastMove = false

newGame()
registerWebMcpTools()
sideDialog.showModal()

newGameButton.addEventListener("click", () => {
  engineRequestId++
  thinking = false
  selectedSquare = null
  render()
  sideDialog.showModal()
})
sideDialog.addEventListener("cancel", (event) => event.preventDefault())
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-side-choice]")) {
  button.addEventListener("click", () => {
    const side = button.dataset.sideChoice
    if (side !== "light" && side !== "dark") return
    startGame(side)
  })
}
rulesButton.addEventListener("click", () => {
  const willOpen = rulesCard.hidden
  rulesCard.hidden = !willOpen
  rulesButton.setAttribute("aria-expanded", String(willOpen))
  if (willOpen) rulesCard.scrollIntoView({ behavior: "smooth", block: "nearest" })
})

engine.addEventListener("message", (event: MessageEvent<EngineResponse>) => {
  const response = event.data
  if (response.requestId !== engineRequestId) return

  thinking = false
  if (response.type === "error" || !response.result) {
    render(`Engine paused: ${response.message ?? "unknown error"}`)
    return
  }

  const result = response.result

  if (result.move) {
    applyGameMove(result.move)
  }
  render()
})

engine.addEventListener("error", () => {
  thinking = false
  render("The house engine could not start. Begin a new round to retry.")
})

function newGame(): void {
  engineRequestId++
  const formation = DARK_FORMATIONS[randomIndex(DARK_FORMATIONS.length)]!
  position = createInitialPosition(formation.backRank)
  formationId = formation.id.toUpperCase()
  selectedSquare = null
  lastMove = null
  history = []
  snapshots = [position]
  thinking = false
  shouldAnimateLastMove = false
  render()

  if (position.turn !== humanColor) window.setTimeout(requestEngineMove, 350)
}

function startGame(side: Color): void {
  humanColor = side
  if (sideDialog.open) sideDialog.close()
  newGame()
}

function requestEngineMove(): void {
  if (displayStatus().type !== "ongoing" || position.turn === humanColor) return

  thinking = true
  selectedSquare = null
  engineRequestId++
  engine.postMessage({
    type: "search",
    requestId: engineRequestId,
    position,
    ...ENGINE_PRESET,
  })
  render()
}

function applyGameMove(move: Move): void {
  const movingColor = position.turn
  const captured = position.board[move.to] ?? null
  position = playMove(position, move)
  history.push({ color: movingColor, move, captured })
  snapshots.push(position)
  lastMove = move
  selectedSquare = null
  shouldAnimateLastMove = true
}

function playHumanMove(move: Move): void {
  if (thinking || position.turn !== humanColor || displayStatus().type !== "ongoing") return
  applyGameMove(move)
  render()
  if (displayStatus().type === "ongoing") window.setTimeout(requestEngineMove, 260)
}

function handleSquareClick(square: number): void {
  if (thinking || position.turn !== humanColor || displayStatus().type !== "ongoing") return

  const legalMoves = generateLegalMoves(position)
  const chosenMoves = selectedSquare === null
    ? []
    : legalMoves.filter((move) => move.from === selectedSquare && move.to === square)

  if (chosenMoves.length > 0) {
    if (chosenMoves.length > 1) showPromotionChoices(chosenMoves)
    else playHumanMove(chosenMoves[0]!)
    return
  }

  const piece = position.board[square]
  selectedSquare = piece?.color === humanColor ? square : null
  render()
}

function showPromotionChoices(moves: Move[]): void {
  promotionOptions.replaceChildren()
  for (const move of moves) {
    const promotion = move.promotion as PromotionPiece
    const button = document.createElement("button")
    button.type = "button"
    button.innerHTML = `<span>${PIECE_GLYPH[humanColor][promotion]}</span>${PIECE_NAME[promotion]}`
    button.addEventListener("click", () => {
      promotionDialog.close()
      playHumanMove(move)
    })
    promotionOptions.append(button)
  }
  promotionDialog.showModal()
}

function render(errorMessage?: string): void {
  const status = displayStatus()
  renderPlayerStrips()
  renderBoard(status)
  renderTurn(status, errorMessage)
  newGameButton.hidden = status.type !== "ongoing"

  thinkingElement.classList.toggle("is-visible", thinking)
  thinkingElement.setAttribute("aria-hidden", String(!thinking))
}

function renderPlayerStrips(): void {
  const houseColor: Color = humanColor === "light" ? "dark" : "light"
  opponentStrip.textContent = `House plays ${houseColor} pieces`
  playerStrip.textContent = `You play ${humanColor} pieces`
}

function renderBoard(status: DisplayStatus): void {
  boardElement.replaceChildren()
  const legalMoves = selectedSquare === null
    ? []
    : generateLegalMoves(position).filter((move) => move.from === selectedSquare)
  const legalTargets = new Set(legalMoves.map((move) => move.to))
  const order = boardOrder()

  for (const square of order) {
    const piece = position.board[square] ?? null
    const button = document.createElement("button")
    const file = square % 5
    const rank = Math.floor(square / 5)
    const isLightTile = (file + rank) % 2 === 1
    const isLastMove = lastMove?.from === square || lastMove?.to === square
    const isCheck = piece?.type === "king" && isInCheck(position, piece.color)

    button.type = "button"
    button.className = [
      "square",
      isLightTile ? "square--light" : "square--dark",
      square === CENTER_SQUARE ? "square--center" : "",
      selectedSquare === square ? "is-selected" : "",
      legalTargets.has(square) ? "is-legal" : "",
      legalTargets.has(square) && Boolean(piece) ? "is-capture" : "",
      isLastMove ? "is-last" : "",
      isCheck ? "is-check" : "",
    ].filter(Boolean).join(" ")
    button.dataset.square = String(square)
    button.setAttribute("role", "gridcell")
    button.setAttribute("aria-label", squareLabel(square, piece, legalTargets.has(square)))
    button.disabled = thinking || status.type !== "ongoing"
    button.addEventListener("click", () => handleSquareClick(square))

    button.innerHTML = `
                ${piece ? `
                  <span class="piece piece--${piece.color}" data-envelope="${PIECE_ENVELOPE_GLYPH[piece.type]}" aria-hidden="true">${PIECE_GLYPH[piece.color][piece.type]}</span>
                ` : ""}
      ${square === CENTER_SQUARE ? '<span class="center-mark" aria-hidden="true">✦</span>' : ""}
    `
    boardElement.append(button)
    if (shouldAnimateLastMove && lastMove?.to === square) {
      animateMovedPiece(button, order, lastMove)
    }
  }

  shouldAnimateLastMove = false
}

function animateMovedPiece(squareElement: HTMLButtonElement, order: number[], move: Move): void {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return

  const pieceElement = squareElement.querySelector<HTMLElement>(".piece")
  const fromIndex = order.indexOf(move.from)
  const toIndex = order.indexOf(move.to)
  if (!pieceElement || fromIndex < 0 || toIndex < 0) return

  const columnOffset = (fromIndex % 5) - (toIndex % 5)
  const rowOffset = Math.floor(fromIndex / 5) - Math.floor(toIndex / 5)
  pieceElement.animate(
    [
      { transform: `translate(${columnOffset * 100}%, calc(${rowOffset * 100}% - 1%))` },
      { transform: "translate(0, -1%)" },
    ],
    { duration: 300, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
  )
}

function renderTurn(status: DisplayStatus, errorMessage?: string): void {
  turnCallout.className = "turn-callout"

  if (errorMessage) {
    turnCallout.classList.add("turn-callout--danger")
    turnCallout.innerHTML = `<span class="turn-pip"></span><div><strong>Engine paused</strong><small>${errorMessage}</small></div>`
    return
  }

  if (status.type !== "ongoing") {
    turnCallout.classList.add("turn-callout--result")
    const { heading, detail } = resultCopy(status)
    turnCallout.innerHTML = `<span class="result-icon" aria-hidden="true">✦</span><div><strong>${heading}</strong><small>${detail}</small></div>`
    return
  }

  if (thinking) {
    turnCallout.classList.add("turn-callout--thinking")
    turnCallout.innerHTML = `<span class="turn-pip"></span><div><strong>The house is thinking</strong><small>It usually takes less than a second.</small></div>`
    return
  }

  if (position.turn === humanColor) {
    const checked = isInCheck(position, humanColor)
    turnCallout.innerHTML = `<span class="turn-pip"></span><div><strong>${checked ? "Your king is in check" : "Your move"}</strong><small>${checked ? "Find a safe square or stop the attack." : "Select a piece to see its legal moves."}</small></div>`
  } else {
    turnCallout.innerHTML = `<span class="turn-pip"></span><div><strong>Engine’s move</strong><small>Waiting for the house.</small></div>`
  }
}

function displayStatus(): DisplayStatus {
  const status = gameStatus(position)
  if (status.type !== "ongoing") return status

  const currentKey = positionKey(position)
  const repetitions = snapshots.filter((snapshot) => positionKey(snapshot) === currentKey).length
  return repetitions >= 3 ? { type: "repetition" } : status
}

function resultCopy(status: Exclude<DisplayStatus, { type: "ongoing" }>): { heading: string; detail: string } {
  if (status.type === "stalemate") return { heading: "Round drawn", detail: "No legal moves remain." }
  if (status.type === "repetition") return { heading: "Round drawn", detail: "The position appeared three times." }

  const didHumanWin = status.winner === humanColor
  if (status.type === "center") {
    return {
      heading: didHumanWin ? "Center claimed—you win" : "The house takes the center",
      detail: `${capitalize(status.winner)} reached c3 safely.`,
    }
  }
  return {
    heading: didHumanWin ? "Checkmate—you win" : "Checkmate—the house wins",
    detail: `${capitalize(status.winner)} closes the round.`,
  }
}

function boardOrder(): number[] {
  const squares = Array.from({ length: 25 }, (_, index) => index)
  if (humanColor === "light") {
    return squares.sort((left, right) => {
      const rankDiff = Math.floor(right / 5) - Math.floor(left / 5)
      return rankDiff || (left % 5) - (right % 5)
    })
  }
  return squares.sort((left, right) => {
    const rankDiff = Math.floor(left / 5) - Math.floor(right / 5)
    return rankDiff || (right % 5) - (left % 5)
  })
}

function squareLabel(square: number, piece: Piece | null, isLegal: boolean): string {
  const coordinate = formatSquare(square)
  const occupant = piece ? `${capitalize(piece.color)} ${PIECE_NAME[piece.type]}` : "Empty"
  return `${coordinate}: ${occupant}${isLegal ? ", legal destination" : ""}`
}

function randomIndex(length: number): number {
  const values = new Uint32Array(1)
  crypto.getRandomValues(values)
  return values[0]! % length
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id)
  if (!element) throw new Error(`Missing element: ${id}`)
  return element as T
}

function gameSnapshot(): Record<string, unknown> {
  const status = displayStatus()
  return {
    humanSide: humanColor,
    turn: position.turn,
    status,
    formation: formationId,
    moves: history.map((entry) => moveToUci(entry.move)),
    legalMoves: status.type === "ongoing" && position.turn === humanColor
      ? generateLegalMoves(position).map(moveToUci)
      : [],
    engineThinking: thinking,
  }
}

function registerWebMcpTools(): void {
  const context = document.modelContext
  if (!context?.registerTool) return

  const reportRegistrationError = (error: unknown): void => {
    console.warn("Barroom Brawl browser tool registration failed", error)
  }

  const register = (tool: ModelContextTool): void => {
    try {
      void Promise.resolve(context.registerTool(tool)).catch(reportRegistrationError)
    } catch (error) {
      reportRegistrationError(error)
    }
  }

  register({
      name: "get_barroom_brawl_game",
      title: "Read Barroom Brawl game",
      description: "Read the current game, move history, and legal moves without changing the board.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: () => gameSnapshot(),
    })
  register({
      name: "start_barroom_brawl_game",
      title: "Start a Barroom Brawl game",
      description: "Start a new randomized game with the human playing Light or Dark.",
      inputSchema: {
        type: "object",
        properties: { side: { type: "string", enum: ["light", "dark"] } },
        required: ["side"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: (input: unknown) => {
        const side = (input as { side?: unknown } | null)?.side
        if (side !== "light" && side !== "dark") throw new Error("side must be light or dark")
        startGame(side)
        return gameSnapshot()
      },
    })
  register({
      name: "play_barroom_brawl_move",
      title: "Play a Barroom Brawl move",
      description: "Play one legal move for the human side using coordinate notation such as c2c3.",
      inputSchema: {
        type: "object",
        properties: { move: { type: "string", pattern: "^[a-e][1-5][a-e][1-5][qrbn]?$" } },
        required: ["move"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: (input: unknown) => {
        const move = (input as { move?: unknown } | null)?.move
        if (typeof move !== "string") throw new Error("move must be a coordinate move such as c2c3")
        if (thinking || position.turn !== humanColor) throw new Error("It is not the human player's turn")
        playHumanMove(parseMove(position, move))
        return gameSnapshot()
      },
    })
}
