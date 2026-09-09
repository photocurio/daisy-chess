import { assessWinPossibility } from "../draw.js"
import { searchBestMove } from "../search.js"
import { Color, Position } from "../types.js"

interface SearchRequest {
  type: "search"
  requestId: number
  position: Position
  maxDepth: number
  timeMs: number
}

interface DrawOfferRequest {
  type: "draw-offer"
  requestId: number
  position: Position
  houseColor: Color
  maxNodes: number
  timeMs: number
}

type EngineRequest = SearchRequest | DrawOfferRequest

self.addEventListener("message", (event: MessageEvent<EngineRequest>) => {
  const request = event.data

  const { requestId } = request

  try {
    if (request.type === "search") {
      const { position, maxDepth, timeMs } = request
      const result = searchBestMove(position, { maxDepth, timeMs })
      self.postMessage({ type: "result", requestId, result })
      return
    }

    const assessment = assessWinPossibility(request.position, request.houseColor, {
      maxNodes: request.maxNodes,
      timeMs: request.timeMs,
    })
    self.postMessage({
      type: "draw-offer",
      requestId,
      accepted: assessment === "impossible",
    })
  } catch (error) {
    self.postMessage({
      type: "error",
      requestId,
      message: error instanceof Error ? error.message : "The engine stopped unexpectedly.",
    })
  }
})
