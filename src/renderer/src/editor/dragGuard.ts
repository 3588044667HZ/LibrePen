export interface DragPoint {
  x: number
  y: number
}

export interface DragBounds {
  left: number
  right: number
  top: number
  bottom: number
}

export function clampDragPoint(point: DragPoint, bounds: DragBounds, inset = 8): DragPoint {
  return {
    x: Math.min(Math.max(point.x, bounds.left + inset), bounds.right - inset),
    y: Math.min(Math.max(point.y, bounds.top + inset), bounds.bottom - inset)
  }
}

export function limitDragStep(previous: DragPoint, next: DragPoint, elapsedMs: number): DragPoint {
  const elapsed = Math.max(1, elapsedMs)
  const distance = Math.hypot(next.x - previous.x, next.y - previous.y)
  const budget = Math.max(24, elapsed * 4)
  if (distance <= budget) return next
  const ratio = budget / distance
  return {
    x: previous.x + (next.x - previous.x) * ratio,
    y: previous.y + (next.y - previous.y) * ratio
  }
}
