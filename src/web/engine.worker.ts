import { searchBestMove } from "../search.js"
import { Position } from "../types.js"

interface EngineRequest {
  type: "search"
  requestId: number
  position: Position
  maxDepth: number
  timeMs: number
}

self.addEventListener("message", (event: MessageEvent<EngineRequest>) => {
  if (event.data.type !== "search") return

  const { requestId, position, maxDepth, timeMs } = event.data

  try {
    const result = searchBestMove(position, { maxDepth, timeMs })
    self.postMessage({
      type: "result",
      requestId,
      result,
    })
  } catch (error) {
    self.postMessage({
      type: "error",
      requestId,
      message: error instanceof Error ? error.message : "The engine stopped unexpectedly.",
    })
  }
})
