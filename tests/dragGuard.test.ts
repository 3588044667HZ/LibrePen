import { describe, expect, it } from 'vitest'
import { clampDragPoint, limitDragStep } from '../src/renderer/src/editor/dragGuard'

const bounds = { left: 100, right: 500, top: 50, bottom: 650 }

describe('drag guard', () => {
  it('clamps pointer coordinates to the visible editor inset', () => {
    expect(clampDragPoint({ x: 20, y: 900 }, bounds)).toEqual({ x: 108, y: 642 })
    expect(clampDragPoint({ x: 300, y: 300 }, bounds)).toEqual({ x: 300, y: 300 })
  })

  it('limits sudden coordinate jumps relative to elapsed time', () => {
    const point = limitDragStep({ x: 200, y: 200 }, { x: 1200, y: 1200 }, 16)
    const distance = Math.hypot(point.x - 200, point.y - 200)
    expect(distance).toBeCloseTo(64)
    expect(point.x).toBeCloseTo(245.2548)
    expect(point.y).toBeCloseTo(245.2548)
  })

  it('allows normal movement and slow jumps', () => {
    expect(limitDragStep({ x: 200, y: 200 }, { x: 210, y: 206 }, 16)).toEqual({ x: 210, y: 206 })
    expect(limitDragStep({ x: 200, y: 200 }, { x: 300, y: 300 }, 100)).toEqual({ x: 300, y: 300 })
  })
})
