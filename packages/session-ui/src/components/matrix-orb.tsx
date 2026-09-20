import { createEffect, onCleanup, onMount } from "solid-js"

export type MatrixOrbState = "idle" | "listening" | "thinking"

type MatrixOrbProps = {
  state?: MatrixOrbState
  level?: number
  size?: number
  dots?: number
  color?: string
  class?: string
}

const tau = Math.PI * 2
const scale: Record<MatrixOrbState, number> = { idle: 0.88, listening: 1, thinking: 0.92 }
const states: MatrixOrbState[] = ["idle", "listening", "thinking"]
const orbiters = [
  { radius: 0.62, speed: 2.2, phase: 0, spread: 0.42 },
  { radius: 0.4, speed: -1.7, phase: 2.1, spread: 0.36 },
  { radius: 0.8, speed: 1.15, phase: 4, spread: 0.34 },
]

export function MatrixOrb(props: MatrixOrbProps) {
  let canvas: HTMLCanvasElement | undefined
  let redraw: (() => void) | undefined

  const state = () => props.state ?? "thinking"
  const size = () => props.size ?? 32
  const dots = () => Math.max(3, Math.round(props.dots ?? 7))
  const level = (time: number) => {
    if (props.level !== undefined && Number.isFinite(props.level)) return Math.min(1, Math.max(0, props.level))
    const slow = 0.5 + 0.5 * Math.sin(time * 0.62 + 0.4)
    const fast = 0.5 + 0.5 * Math.sin(time * 1.9 + 1.1)
    return 0.22 + 0.78 * (0.45 + 0.55 * slow) * fast
  }

  onMount(() => {
    const context = canvas?.getContext("2d")
    if (!canvas || !context) return

    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const weights: Record<MatrixOrbState, number> = { idle: 0, listening: 0, thinking: 0 }
    let frame = 0
    let currentTime = 0
    let amplitude = 0
    let currentScale = scale[state()]
    let velocity = 0
    let last = performance.now()

    const setup = () => {
      const buffer = Math.round(size() * Math.min(window.devicePixelRatio || 1, 4))
      canvas.width = buffer
      canvas.height = buffer
      context.setTransform(buffer / size(), 0, 0, buffer / size(), 0, 0)
      canvas.style.color = props.color ?? "var(--v2-text-text-accent)"
      context.fillStyle = getComputedStyle(canvas).color
    }

    const intensity = (distance: number, x: number, y: number, time: number, current: MatrixOrbState) => {
      if (current === "listening") {
        const ripple = 0.5 + 0.5 * Math.sin(distance * 4.2 - time * 3)
        return 0.32 + amplitude * (0.34 + 0.38 * ripple)
      }
      if (current === "thinking") {
        const heat = orbiters.reduce((total, orbiter) => {
          const angle = time * orbiter.speed + orbiter.phase
          const dx = x - Math.cos(angle) * orbiter.radius
          const dy = y - Math.sin(angle) * orbiter.radius
          return total + Math.exp(-(dx * dx + dy * dy) / (orbiter.spread * orbiter.spread))
        }, 0)
        return 0.26 + 0.8 * Math.min(1, heat)
      }
      return 0.62 + 0.12 * Math.sin(time * 1.05 - distance * 2.4)
    }

    const draw = (time: number) => {
      const grid = dots()
      const half = (grid - 1) / 2
      const spacing = (size() * 0.74) / (grid - 1)
      const maxRadius = spacing * 0.6
      const center = size() / 2
      context.clearRect(0, 0, size(), size())

      for (let y = 0; y < grid; y++) {
        for (let x = 0; x < grid; x++) {
          const normalizedX = (x - half) / half
          const normalizedY = (y - half) / half
          const distance = Math.hypot(normalizedX, normalizedY)
          if (distance > 1.12) continue
          const value = states.reduce(
            (total, item) => total + weights[item] * intensity(distance, normalizedX, normalizedY, time, item),
            0,
          )
          const radius =
            maxRadius * Math.exp(-distance * distance * 1.7) * Math.min(1, Math.max(0, value)) * currentScale
          if (radius * (window.devicePixelRatio || 1) < 0.5) continue
          context.beginPath()
          context.arc(
            center + (x - half) * spacing * currentScale,
            center + (y - half) * spacing * currentScale,
            radius,
            0,
            tau,
          )
          context.fill()
        }
      }
    }

    const renderStatic = () => {
      for (const item of states) weights[item] = item === state() ? 1 : 0
      currentScale = scale[state()]
      amplitude = level(0)
      draw(0)
    }

    const animate = (now: number) => {
      const delta = Math.min((now - last) / 1000, 0.05)
      last = now
      currentTime += delta
      const target = level(currentTime)
      const rate = target > amplitude ? 0.22 : 0.08
      amplitude += (target - amplitude) * (1 - Math.pow(1 - rate, delta * 60))
      const blend = 1 - Math.pow(1 - 0.16, delta * 60)
      for (const item of states) weights[item] += ((item === state() ? 1 : 0) - weights[item]) * blend
      velocity += (-180 * (currentScale - scale[state()]) - 26 * velocity) * delta
      currentScale += velocity * delta
      draw(currentTime)
      frame = requestAnimationFrame(animate)
    }

    const render = () => {
      cancelAnimationFrame(frame)
      setup()
      if (media.matches) {
        renderStatic()
        return
      }
      last = performance.now()
      frame = requestAnimationFrame(animate)
    }

    redraw = () => {
      if (media.matches) renderStatic()
    }
    window.addEventListener("resize", render)
    media.addEventListener("change", render)
    render()
    onCleanup(() => {
      cancelAnimationFrame(frame)
      window.removeEventListener("resize", render)
      media.removeEventListener("change", render)
      redraw = undefined
    })
  })

  createEffect(() => {
    state()
    props.level
    redraw?.()
  })

  return (
    <canvas
      ref={canvas}
      data-component="matrix-orb"
      aria-hidden="true"
      class={props.class}
      style={{
        display: "block",
        width: `${size()}px`,
        height: `${size()}px`,
        "flex-shrink": 0,
      }}
    />
  )
}
