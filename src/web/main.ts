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
    king: "♚",
    queen: "♛",
    rook: "♜",
    bishop: "♝",
    knight: "♞",
    pawn: "♟",
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

const PIECE_DETAIL_GLYPH: Record<PieceType, string> = {
  king: "♔",
  queen: "♕",
  rook: "♖",
  bishop: "♗",
  knight: "♘",
  pawn: "♙",
}

const PIECE_NAME: Record<PieceType, string> = {
  king: "King",
  queen: "Queen",
  rook: "Rook",
  bishop: "Bishop",
  knight: "Knight",
  pawn: "Pawn",
}

const FILES = "abcde"
const CENTER_SQUARE = 12

const app = document.querySelector<HTMLDivElement>("#app")
if (!app) throw new Error("App mount point was not found")

app.innerHTML = `
  <main class="game-shell">
    <header class="masthead">
      <a class="wordmark" href="#" aria-label="Barroom Brawl home">
        <span class="wordmark-mark" aria-hidden="true">BB</span>
        <span>
          <strong>Barroom Brawl</strong>
          <small>Five-by-five chess</small>
        </span>
      </a>
      <div class="header-rule" aria-hidden="true"></div>
      <p class="header-objective"><span></span> Capture the king’s options—or reach the center first.</p>
      <button class="icon-button" id="rules-button" type="button" aria-expanded="false" aria-controls="rules-card">
        <span aria-hidden="true">?</span><span class="button-label">How to play</span>
      </button>
    </header>

    <section class="play-layout" aria-label="Barroom Brawl game">
      <div class="board-stage">
        <div class="player-strip player-strip--opponent" id="opponent-strip"></div>
        <div class="board-wrap">
          <div class="board" id="board" role="grid" aria-label="Barroom Brawl board"></div>
          <div class="board-thinking" id="board-thinking" aria-hidden="true">
            <span></span><span></span><span></span>
          </div>
        </div>
        <div class="player-strip" id="player-strip"></div>
      </div>

      <aside class="match-panel">
        <section class="match-card">
          <div class="match-card-heading">
            <div>
              <span class="eyebrow">Exhibition match</span>
              <h1>Take the center.</h1>
            </div>
            <span class="round-badge" id="formation-badge">—</span>
          </div>

          <div class="side-control" aria-label="Choose your army">
            <span>You play</span>
            <div class="segmented">
              <button type="button" data-side="light" aria-pressed="true"><span>♕</span> Light</button>
              <button type="button" data-side="dark" aria-pressed="false"><span>♝</span> Dark</button>
            </div>
          </div>

          <div class="turn-callout" id="turn-callout" role="status" aria-live="polite">
            <span class="turn-pip"></span>
            <div><strong>Your move</strong><small>Select a piece to see its legal moves.</small></div>
          </div>

          <div class="evaluation" aria-label="Position evaluation">
            <div class="evaluation-labels"><span>Dark</span><strong id="evaluation-text">Even</strong><span>Light</span></div>
            <div class="evaluation-track"><span class="evaluation-marker" id="evaluation-marker"></span></div>
          </div>

          <div class="move-section">
            <div class="section-heading"><h2>Scorecard</h2><span id="move-count">Opening position</span></div>
            <div class="move-list" id="move-list">
              <p class="empty-moves">The first round is yours.</p>
            </div>
          </div>

          <div class="match-actions">
            <button class="primary-button" id="new-game" type="button">New round <span aria-hidden="true">↻</span></button>
            <button class="secondary-button" id="undo" type="button" disabled>Take back</button>
          </div>

          <label class="engine-setting" for="engine-strength">
            <span><strong>House engine</strong><small>Runs locally in your browser</small></span>
            <select id="engine-strength">
              <option value="quick">Quick</option>
              <option value="steady" selected>Steady</option>
              <option value="sharp">Sharp</option>
            </select>
          </label>
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
const opponentStrip = requireElement<HTMLDivElement>("opponent-strip")
const playerStrip = requireElement<HTMLDivElement>("player-strip")
const turnCallout = requireElement<HTMLDivElement>("turn-callout")
const formationBadge = requireElement<HTMLSpanElement>("formation-badge")
const evaluationText = requireElement<HTMLElement>("evaluation-text")
const evaluationMarker = requireElement<HTMLSpanElement>("evaluation-marker")
const moveList = requireElement<HTMLDivElement>("move-list")
const moveCount = requireElement<HTMLSpanElement>("move-count")
const undoButton = requireElement<HTMLButtonElement>("undo")
const newGameButton = requireElement<HTMLButtonElement>("new-game")
const strengthSelect = requireElement<HTMLSelectElement>("engine-strength")
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
let evaluationForLight = 0
let engineMeta: Pick<EngineResult, "depth" | "nodes" | "elapsedMs"> | null = null

newGame()
registerWebMcpTools()

document.querySelectorAll<HTMLButtonElement>("[data-side]").forEach((button) => {
  button.addEventListener("click", () => {
    const nextSide = button.dataset.side as Color
    if (nextSide === humanColor) return
    humanColor = nextSide
    updateSideControls()
    newGame()
  })
})

newGameButton.addEventListener("click", newGame)
undoButton.addEventListener("click", takeBack)
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
    engineMeta = null
    render(`Engine paused: ${response.message ?? "unknown error"}`)
    return
  }

  const result = response.result
  engineMeta = result
  evaluationForLight = result.score * (position.turn === "light" ? 1 : -1)

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
  evaluationForLight = 0
  engineMeta = null
  render()

  if (position.turn !== humanColor) window.setTimeout(requestEngineMove, 350)
}

function requestEngineMove(): void {
  if (displayStatus().type !== "ongoing" || position.turn === humanColor) return

  thinking = true
  selectedSquare = null
  engineRequestId++
  const preset = {
    quick: { maxDepth: 4, timeMs: 90 },
    steady: { maxDepth: 6, timeMs: 300 },
    sharp: { maxDepth: 8, timeMs: 800 },
  }[strengthSelect.value] ?? { maxDepth: 6, timeMs: 300 }

  engine.postMessage({
    type: "search",
    requestId: engineRequestId,
    position,
    ...preset,
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
}

function playHumanMove(move: Move): void {
  if (thinking || position.turn !== humanColor || displayStatus().type !== "ongoing") return
  applyGameMove(move)
  render()
  if (displayStatus().type === "ongoing") window.setTimeout(requestEngineMove, 260)
}

function takeBack(): void {
  if (thinking) return

  let target = -1
  for (let index = snapshots.length - 2; index >= 0; index--) {
    if (snapshots[index]!.turn === humanColor) {
      target = index
      break
    }
  }
  if (target < 0) return

  engineRequestId++
  position = snapshots[target]!
  snapshots = snapshots.slice(0, target + 1)
  history = history.slice(0, target)
  lastMove = history.at(-1)?.move ?? null
  selectedSquare = null
  evaluationForLight = 0
  engineMeta = null
  render()
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
  renderBoard(status)
  renderPlayerStrips()
  renderTurn(status, errorMessage)
  renderHistory()
  renderEvaluation()

  formationBadge.textContent = `SET · ${formationId}`
  thinkingElement.classList.toggle("is-visible", thinking)
  thinkingElement.setAttribute("aria-hidden", String(!thinking))
  undoButton.disabled = thinking || !canTakeBack()
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

    const showFile = humanColor === "light" ? rank === 0 : rank === 4
    const showRank = humanColor === "light" ? file === 0 : file === 4
    button.innerHTML = `
      ${piece ? `
        <span class="piece piece--${piece.color}" aria-hidden="true">
          <span class="piece-silhouette">${PIECE_GLYPH[piece.color][piece.type]}</span>
          <span class="piece-detail">${PIECE_DETAIL_GLYPH[piece.type]}</span>
        </span>
      ` : ""}
      ${square === CENTER_SQUARE ? '<span class="center-mark" aria-hidden="true">✦</span>' : ""}
      ${showFile ? `<span class="coord coord--file">${FILES[file]}</span>` : ""}
      ${showRank ? `<span class="coord coord--rank">${rank + 1}</span>` : ""}
    `
    boardElement.append(button)
  }
}

function renderPlayerStrips(): void {
  const opponentColor = humanColor === "light" ? "dark" : "light"
  opponentStrip.innerHTML = playerStripMarkup(opponentColor, true)
  playerStrip.innerHTML = playerStripMarkup(humanColor, false)
}

function playerStripMarkup(color: Color, opponent: boolean): string {
  const captured = history.filter((entry) => entry.captured?.color === color).map((entry) => entry.captured!)
  const detail = opponent
    ? thinking ? "Calculating…" : "House engine"
    : "You"

  return `
    <span class="player-avatar player-avatar--${color}" aria-hidden="true">${PIECE_GLYPH[color].king}</span>
    <span class="player-name"><strong>${capitalize(color)}</strong><small>${detail}</small></span>
    <span class="captured-pieces" aria-label="${captured.length} captured pieces">
      ${captured.map((piece) => PIECE_GLYPH[piece.color][piece.type]).join("")}
    </span>
    <span class="turn-indicator ${position.turn === color ? "is-active" : ""}" aria-label="${position.turn === color ? "Turn to move" : "Waiting"}"></span>
  `
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

function renderHistory(): void {
  moveCount.textContent = history.length === 0
    ? "Opening position"
    : `${history.length} ${history.length === 1 ? "move" : "moves"}`

  if (history.length === 0) {
    moveList.innerHTML = '<p class="empty-moves">The first round is yours.</p>'
    return
  }

  const rows: string[] = []
  for (let index = 0; index < history.length; index += 2) {
    const first = history[index]
    const second = history[index + 1]
    rows.push(`
      <div class="move-row">
        <span>${Math.floor(index / 2) + 1}</span>
        <strong>${first ? prettyMove(first.move, first.captured) : "—"}</strong>
        <strong>${second ? prettyMove(second.move, second.captured) : '<i class="move-pending">…</i>'}</strong>
      </div>
    `)
  }
  moveList.innerHTML = rows.join("")
  moveList.scrollTop = moveList.scrollHeight
}

function renderEvaluation(): void {
  const boundedScore = Math.max(-900, Math.min(900, evaluationForLight))
  const markerPosition = 50 + (boundedScore / 900) * 46
  evaluationMarker.style.left = `${markerPosition}%`

  if (Math.abs(evaluationForLight) >= 99_000) {
    evaluationText.textContent = evaluationForLight > 0 ? "Light has mate" : "Dark has mate"
  } else if (Math.abs(evaluationForLight) < 15) {
    evaluationText.textContent = "Even"
  } else {
    const favored = evaluationForLight > 0 ? "Light" : "Dark"
    evaluationText.textContent = `${favored} +${(Math.abs(evaluationForLight) / 100).toFixed(1)}`
  }

  if (engineMeta) {
    evaluationText.title = `Depth ${engineMeta.depth} · ${engineMeta.nodes.toLocaleString()} positions · ${Math.round(engineMeta.elapsedMs)} ms`
  } else {
    evaluationText.removeAttribute("title")
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

function canTakeBack(): boolean {
  if (snapshots.length < 2) return false
  for (let index = snapshots.length - 2; index >= 0; index--) {
    if (snapshots[index]!.turn === humanColor) return true
  }
  return false
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

function prettyMove(move: Move, captured: Piece | null): string {
  const movingPiece = snapshots[history.findIndex((entry) => entry.move === move)]?.board[move.from]
  const token = movingPiece?.type === "pawn" ? "" : movingPiece ? PIECE_GLYPH[movingPiece.color][movingPiece.type] : ""
  const separator = captured ? "×" : "–"
  const promotion = move.promotion && movingPiece ? `=${PIECE_GLYPH[movingPiece.color][move.promotion]}` : ""
  return `${token}${formatSquare(move.from)}${separator}${formatSquare(move.to)}${promotion}`
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

function updateSideControls(): void {
  document.querySelectorAll<HTMLButtonElement>("[data-side]").forEach((choice) => {
    choice.setAttribute("aria-pressed", String(choice.dataset.side === humanColor))
  })
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
        humanColor = side
        updateSideControls()
        newGame()
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
