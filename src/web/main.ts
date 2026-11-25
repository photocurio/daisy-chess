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
  opposite,
} from "../types.js"

type DisplayStatus = GameStatus
  | { type: "repetition" }
  | { type: "agreed-draw" }
  | { type: "resignation"; winner: Color }
type Difficulty = "easy" | "hard"

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
  type: "result" | "draw-offer" | "error"
  requestId: number
  result?: EngineResult
  accepted?: boolean
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
const ENGINE_PRESETS: Record<Difficulty, { maxDepth: number; timeMs: number }> = {
  easy: { maxDepth: 2, timeMs: 80 },
  hard: { maxDepth: 6, timeMs: 300 },
}

const app = document.querySelector<HTMLDivElement>("#app")
if (!app) throw new Error("App mount point was not found")

app.innerHTML = `
  <main class="game-shell">
    <header class="masthead">
      <div class="game-title">
        <strong><span>Food</span> <span>Fight</span></strong>
      </div>
      <button class="icon-button" id="rules-button" type="button" aria-expanded="false" aria-controls="rules-card">
        <span aria-hidden="true">?</span><span class="button-label">How to play</span>
      </button>
    </header>

    <section class="play-layout" aria-label="Daisy Chess game">
      <div class="board-stage">
        <div class="board-wrap">
          <div class="board" id="board" role="grid" aria-label="Daisy Chess board" aria-describedby="win-condition"></div>
          <div class="board-thinking" id="board-thinking" aria-hidden="true">
            <span></span><span></span><span></span>
          </div>
        </div>
        <p class="win-condition" id="win-condition">Reach the center with your king to win, or checkmate the opponent</p>
      </div>

      <aside class="match-panel">
        <section class="match-card">
          <div class="side-choice" id="side-choice">
            <div class="new-game-heading">
              <span class="eyebrow">New game</span>
              <label class="hard-mode-option">
                <input id="difficulty-toggle" type="checkbox" />
                <span>Hard mode</span>
              </label>
            </div>
            <h2>Choose the light or dark pieces</h2>
            <div class="side-options">
              <button type="button" data-side-choice="light">Play light</button>
              <button type="button" data-side-choice="dark">Play dark</button>
            </div>
          </div>

          <div class="game-controls" id="game-controls" hidden>
            <div class="turn-callout" id="turn-callout" role="status" aria-live="polite">
              <div><strong>Your move</strong></div>
            </div>

            <div class="match-actions">
              <a class="game-action-link" id="resign" href="#resign">Resign</a>
              <a class="game-action-link" id="offer-draw" href="#offer-draw">Offer draw</a>
              <button class="new-game-button" id="new-game" type="button" hidden>New game</button>
            </div>
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
const resignLink = requireElement<HTMLAnchorElement>("resign")
const offerDrawLink = requireElement<HTMLAnchorElement>("offer-draw")
const newGameButton = requireElement<HTMLButtonElement>("new-game")
const sideChoice = requireElement<HTMLDivElement>("side-choice")
const gameControls = requireElement<HTMLDivElement>("game-controls")
const difficultyToggle = requireElement<HTMLInputElement>("difficulty-toggle")
const rulesButton = requireElement<HTMLButtonElement>("rules-button")
const rulesCard = requireElement<HTMLElement>("rules-card")
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
let choosingSide = true
let difficulty: Difficulty = "easy"
let drawAgreed = false
let resigned = false
let eventNotice: string | null = null
let consideringDraw = false

showSideChoice()
registerWebMcpTools()

resignLink.addEventListener("click", (event) => {
  event.preventDefault()
  resignGame()
})
offerDrawLink.addEventListener("click", (event) => {
  event.preventDefault()
  offerDraw()
})
newGameButton.addEventListener("click", showSideChoice)
for (const button of document.querySelectorAll<HTMLButtonElement>("[data-side-choice]")) {
  button.addEventListener("click", () => {
    const side = button.dataset.sideChoice
    if (side !== "light" && side !== "dark") return
    startGame(side)
  })
}
difficultyToggle.addEventListener("change", () => {
  difficulty = difficultyToggle.checked ? "hard" : "easy"
})
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
  consideringDraw = false
  if (response.type === "error") {
    render(`Engine paused: ${response.message ?? "unknown error"}`)
    return
  }

  if (response.type === "draw-offer") {
    if (response.accepted) drawAgreed = true
    else eventNotice = "Draw declined—your move"
    render()
    return
  }

  if (!response.result) {
    render("Engine paused: no move was returned")
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
  consideringDraw = false
  drawAgreed = false
  resigned = false
  eventNotice = null
  shouldAnimateLastMove = false
  render()

  if (position.turn !== humanColor) window.setTimeout(requestEngineMove, 350)
}

function startGame(side: Color): void {
  engineRequestId++
  humanColor = side
  choosingSide = false
  selectedSquare = null
  thinking = false
  render()

  if (position.turn !== humanColor) window.setTimeout(requestEngineMove, 350)
}

function showSideChoice(): void {
  humanColor = "light"
  choosingSide = true
  newGame()
}

function requestEngineMove(): void {
  if (choosingSide || displayStatus().type !== "ongoing" || position.turn === humanColor) return

  thinking = true
  consideringDraw = false
  eventNotice = null
  selectedSquare = null
  engineRequestId++
  engine.postMessage({
    type: "search",
    requestId: engineRequestId,
    position,
    ...ENGINE_PRESETS[difficulty],
  })
  render()
}

function offerDraw(): void {
  if (choosingSide || thinking || position.turn !== humanColor || displayStatus().type !== "ongoing") return

  thinking = true
  consideringDraw = true
  eventNotice = null
  selectedSquare = null
  engineRequestId++
  engine.postMessage({
    type: "draw-offer",
    requestId: engineRequestId,
    position,
    houseColor: opposite(humanColor),
    maxNodes: 25_000,
    timeMs: 150,
  })
  render()
}

function resignGame(): void {
  if (choosingSide || displayStatus().type !== "ongoing") return

  engineRequestId++
  thinking = false
  consideringDraw = false
  eventNotice = null
  selectedSquare = null
  resigned = true
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
  eventNotice = null
  shouldAnimateLastMove = true
}

function playHumanMove(move: Move): void {
  if (choosingSide || thinking || position.turn !== humanColor || displayStatus().type !== "ongoing") return
  applyGameMove(move)
  render()
  if (displayStatus().type === "ongoing") window.setTimeout(requestEngineMove, 260)
}

function handleSquareClick(square: number): void {
  if (choosingSide || thinking || position.turn !== humanColor || displayStatus().type !== "ongoing") return

  eventNotice = null

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
  renderBoard(status)
  renderTurn(status, errorMessage)
  sideChoice.hidden = !choosingSide
  gameControls.hidden = choosingSide
  resignLink.hidden = choosingSide || status.type !== "ongoing"
  offerDrawLink.hidden = choosingSide
    || thinking
    || status.type !== "ongoing"
    || position.turn !== humanColor
  newGameButton.hidden = choosingSide || status.type === "ongoing"

  thinkingElement.classList.toggle("is-visible", thinking)
  thinkingElement.setAttribute("aria-hidden", String(!thinking))
}

function renderBoard(status: DisplayStatus): void {
  boardElement.replaceChildren()
  const canHumanMove = !choosingSide
    && !thinking
    && status.type === "ongoing"
    && position.turn === humanColor
  const allLegalMoves = canHumanMove ? generateLegalMoves(position) : []
  const legalMoves = selectedSquare === null
    ? []
    : allLegalMoves.filter((move) => move.from === selectedSquare)
  const legalTargets = new Set(legalMoves.map((move) => move.to))
  const selectableSquares = new Set(allLegalMoves.map((move) => move.from))
  const order = boardOrder()

  for (const square of order) {
    const piece = position.board[square] ?? null
    const button = document.createElement("button")
    const file = square % 5
    const rank = Math.floor(square / 5)
    const isLightTile = (file + rank) % 2 === 1
    const isCheck = piece?.type === "king" && isInCheck(position, piece.color)
    const isCenterWin = status.type === "center" && square === CENTER_SQUARE
    const isSelectable = piece?.color === humanColor && selectableSquares.has(square)
    const isLegalTarget = !choosingSide && legalTargets.has(square)

    button.type = "button"
    button.className = [
      "square",
      isLightTile ? "square--light" : "square--dark",
      square === CENTER_SQUARE ? "square--center" : "",
      selectedSquare === square ? "is-selected" : "",
      legalTargets.has(square) ? "is-legal" : "",
      legalTargets.has(square) && Boolean(piece) ? "is-capture" : "",
      isCheck ? "is-check" : "",
      isCenterWin ? "is-center-win" : "",
      isSelectable ? "is-selectable" : "",
    ].filter(Boolean).join(" ")
    button.dataset.square = String(square)
    button.setAttribute("role", "gridcell")
    button.setAttribute("aria-label", squareLabel(square, piece, legalTargets.has(square)))
    button.disabled = !isSelectable && !isLegalTarget
    button.addEventListener("click", () => handleSquareClick(square))

    button.innerHTML = `
                ${piece ? `
                  <span class="piece piece--${piece.color}" data-envelope="${PIECE_ENVELOPE_GLYPH[piece.type]}" aria-hidden="true">${PIECE_GLYPH[piece.color][piece.type]}</span>
                ` : ""}
      ${square === CENTER_SQUARE ? '<span class="center-mark" aria-hidden="true"></span>' : ""}
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
    turnCallout.innerHTML = "<div><strong>Engine paused</strong></div>"
    return
  }

  if (eventNotice) {
    turnCallout.classList.add("turn-callout--event")
    turnCallout.innerHTML = `<div><strong>${eventNotice}</strong></div>`
    return
  }

  if (status.type !== "ongoing") {
    turnCallout.classList.add("turn-callout--result")
    const heading = resultCopy(status)
    const didLoseByCheckmate = status.type === "checkmate" && status.winner !== humanColor
    const isDecisiveResult = status.type === "checkmate"
      || status.type === "center"
      || status.type === "resignation"
    if (isDecisiveResult) turnCallout.classList.add("turn-callout--decisive")
    const italicClass = didLoseByCheckmate
      ? "result-heading--italic"
      : ""
    turnCallout.innerHTML = `<div><strong class="${italicClass}">${heading}</strong></div>`
    return
  }

  if (thinking) {
    turnCallout.innerHTML = consideringDraw
      ? "<div><strong>The house is considering</strong></div>"
      : "<div><strong>The house is thinking</strong></div>"
    return
  }

  if (position.turn === humanColor) {
    const checked = isInCheck(position, humanColor)
    turnCallout.innerHTML = checked
      ? '<div><strong class="result-heading--italic">Check</strong></div>'
      : "<div><strong>Your move</strong></div>"
  } else {
    turnCallout.innerHTML = "<div><strong>Engine’s move</strong></div>"
  }
}

function displayStatus(): DisplayStatus {
  if (resigned) return { type: "resignation", winner: opposite(humanColor) }
  if (drawAgreed) return { type: "agreed-draw" }

  const status = gameStatus(position)
  if (status.type !== "ongoing") return status

  const currentKey = positionKey(position)
  const repetitions = snapshots.filter((snapshot) => positionKey(snapshot) === currentKey).length
  return repetitions >= 3 ? { type: "repetition" } : status
}

function resultCopy(status: Exclude<DisplayStatus, { type: "ongoing" }>): string {
  if (status.type === "resignation") return "You resigned—the house wins"
  if (status.type === "agreed-draw") return "Draw agreed"
  if (status.type === "stalemate" || status.type === "repetition") return "Round drawn"

  const didHumanWin = status.winner === humanColor
  if (status.type === "center") {
    return didHumanWin ? "Center claimed—you win" : "The house takes the center"
  }
  return didHumanWin ? "Checkmate—you win" : "Checkmate—the house wins."
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
    difficulty,
    awaitingSideChoice: choosingSide,
  }
}

function registerWebMcpTools(): void {
  const context = document.modelContext
  if (!context?.registerTool) return

  const reportRegistrationError = (error: unknown): void => {
    console.warn("Daisy Chess browser tool registration failed", error)
  }

  const register = (tool: ModelContextTool): void => {
    try {
      void Promise.resolve(context.registerTool(tool)).catch(reportRegistrationError)
    } catch (error) {
      reportRegistrationError(error)
    }
  }

  register({
      name: "get_daisy_chess_game",
      title: "Read Daisy Chess game",
      description: "Read the current game, move history, and legal moves without changing the board.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: () => gameSnapshot(),
    })
  register({
      name: "start_daisy_chess_game",
      title: "Start a Daisy Chess game",
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
        showSideChoice()
        startGame(side)
        return gameSnapshot()
      },
    })
  register({
      name: "play_daisy_chess_move",
      title: "Play a Daisy Chess move",
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
