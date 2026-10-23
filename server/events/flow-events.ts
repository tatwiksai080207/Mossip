import { Router, type Request, type Response } from 'express'

export interface FlowStepEvent {
  stepId: string
  status: 'pending' | 'running' | 'done' | 'error'
  details?: Record<string, unknown>
  timestamp: number
}

const clients = new Set<Response>()

/**
 * Broadcasts a real-time protocol flow step update to all connected workbench clients.
 */
export function notifyFlowStep(
  stepId: string,
  status: 'pending' | 'running' | 'done' | 'error',
  details?: Record<string, unknown>
): void {
  const event: FlowStepEvent = {
    stepId,
    status,
    details,
    timestamp: Date.now(),
  }

  const payload = `data: ${JSON.stringify(event)}\n\n`
  for (const client of clients) {
    try {
      client.write(payload)
    } catch (err) {
      clients.delete(client)
    }
  }
}

/**
 * Creates the Server-Sent Events (SSE) router for real-time wallet step advancement.
 */
export function createFlowEventsRouter(): Router {
  const router = Router()

  router.get('/api/events/flow-stream', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.setHeader('X-Accel-Buffering', 'no')
    res.flushHeaders?.()

    // Send initial connection acknowledgement
    res.write(`: connected\n\n`)
    clients.add(res)

    req.on('close', () => {
      clients.delete(res)
    })
  })

  return router
}
