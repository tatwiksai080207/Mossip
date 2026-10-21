/**
 * WebSocket & Network Event Telemetry Bus
 * Intercepts and broadcasts HTTP latency, payload sizes, and statuses to SequenceDiagram and UI.
 */

export interface NetworkTelemetryEvent {
  method: string
  url: string
  path: string
  status: number
  latencyMs: number
  payloadSize: string
  timestamp?: number
}

type TelemetryListener = (event: NetworkTelemetryEvent) => void
const listeners = new Set<TelemetryListener>()

export function registerTelemetryListener(listener: TelemetryListener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function broadcastNetworkEvent(event: NetworkTelemetryEvent) {
  const fullEvent = { ...event, timestamp: event.timestamp || Date.now() }
  for (const listener of listeners) {
    try {
      listener(fullEvent)
    } catch (err) {
      console.error('[telemetry] Error in listener:', err)
    }
  }
}

// Preserve global scope attachment for seamless cross-module interception
if (typeof globalThis !== 'undefined') {
  ;(globalThis as any).broadcastNetworkEvent = broadcastNetworkEvent
}
