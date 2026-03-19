"use client"

import { useEffect, useRef } from "react"

// ---- Perlin noise (classic 2D + time as 3rd dimension) ----

const PERM = new Uint8Array(512)
const GRAD3 = [
  [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
  [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
  [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
]

// Seed permutation table once
;(() => {
  const p = Array.from({ length: 256 }, (_, i) => i)
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[p[i], p[j]] = [p[j], p[i]]
  }
  for (let i = 0; i < 512; i++) PERM[i] = p[i & 255]
})()

function fade(t: number) { return t * t * t * (t * (t * 6 - 15) + 10) }
function lerp(a: number, b: number, t: number) { return a + t * (b - a) }

function dot3(g: number[], x: number, y: number, z: number) {
  return g[0] * x + g[1] * y + g[2] * z
}

function noise3(x: number, y: number, z: number): number {
  const X = Math.floor(x) & 255
  const Y = Math.floor(y) & 255
  const Z = Math.floor(z) & 255
  x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z)
  const u = fade(x), v = fade(y), w = fade(z)
  const A = PERM[X] + Y, AA = PERM[A] + Z, AB = PERM[A + 1] + Z
  const B = PERM[X + 1] + Y, BA = PERM[B] + Z, BB = PERM[B + 1] + Z
  return lerp(
    lerp(
      lerp(dot3(GRAD3[PERM[AA] % 12], x, y, z), dot3(GRAD3[PERM[BA] % 12], x - 1, y, z), u),
      lerp(dot3(GRAD3[PERM[AB] % 12], x, y - 1, z), dot3(GRAD3[PERM[BB] % 12], x - 1, y - 1, z), u),
      v,
    ),
    lerp(
      lerp(dot3(GRAD3[PERM[AA + 1] % 12], x, y, z - 1), dot3(GRAD3[PERM[BA + 1] % 12], x - 1, y, z - 1), u),
      lerp(dot3(GRAD3[PERM[AB + 1] % 12], x, y - 1, z - 1), dot3(GRAD3[PERM[BB + 1] % 12], x - 1, y - 1, z - 1), u),
      v,
    ),
    w,
  )
}

/** Two octaves of noise, returns 0..1 */
function fbm(x: number, y: number, z: number): number {
  const v = noise3(x, y, z) * 0.65 + noise3(x * 2.0, y * 2.0, z * 2.0) * 0.35
  return (v + 1) * 0.5 // normalize -1..1 → 0..1
}

/** High-frequency local oscillation, returns -1..1 */
function localOsc(x: number, y: number, z: number): number {
  // Use an offset domain (+100) so it's uncorrelated with the base field.
  // High spatial freq (8x) + fast time (3x) = per-pixel shimmer.
  return noise3(x * 8.0 + 100, y * 8.0 + 100, z * 3.0)
}

// ---- Component ----

interface PixelGridProps {
  bgColor?: string
  pixelColor?: string
  pixelSize?: number
  pixelSpacing?: number
  /** How zoomed-in the noise field is. Lower = larger waves. Default 0.06 */
  noiseScale?: number
  /** How fast the waves move. Default 0.4 */
  speed?: number
  /** Minimum alpha for visible pixels (0..1). Default 0 */
  minAlpha?: number
  /** Maximum alpha for visible pixels (0..1). Default 1 */
  maxAlpha?: number
  /** Below this noise threshold pixels are fully off. Creates gaps. Default 0.3 */
  cutoff?: number
  className?: string
  glow?: boolean
  /** When true, sizes to parent container instead of viewport */
  contained?: boolean
}

export function PixelGrid({
  bgColor = "transparent",
  pixelColor = "#0000ff",
  pixelSize = 3,
  pixelSpacing = 3,
  noiseScale = 0.06,
  speed = 0.4,
  minAlpha = 0,
  maxAlpha = 1,
  cutoff = 0.3,
  glow = false,
  className = "",
  contained = false,
}: PixelGridProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const c2d = canvas.getContext("2d", { alpha: true })
    if (!c2d) return

    const step = pixelSize + pixelSpacing

    const getSize = () => {
      if (contained && canvas.parentElement) {
        return {
          w: canvas.parentElement.offsetWidth,
          h: canvas.parentElement.offsetHeight,
        }
      }
      return { w: window.innerWidth, h: window.innerHeight }
    }

    let cols = 0
    let rows = 0

    const resizeCanvas = () => {
      const { w, h } = getSize()
      canvas.width = w
      canvas.height = h
      cols = Math.ceil(w / step)
      rows = Math.ceil(h / step)
    }

    resizeCanvas()

    const onResize = () => resizeCanvas()

    let resizeObserver: ResizeObserver | null = null
    if (contained) {
      resizeObserver = new ResizeObserver(onResize)
      if (canvas.parentElement) resizeObserver.observe(canvas.parentElement)
    } else {
      window.addEventListener("resize", onResize)
    }

    const startTime = performance.now()

    const renderLoop = () => {
      const t = (performance.now() - startTime) / 1000 * speed

      if (bgColor === "transparent") {
        c2d.clearRect(0, 0, canvas.width, canvas.height)
      } else {
        c2d.fillStyle = bgColor
        c2d.fillRect(0, 0, canvas.width, canvas.height)
      }

      if (glow) {
        c2d.shadowBlur = 8
        c2d.shadowColor = pixelColor
      } else {
        c2d.shadowBlur = 0
      }

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const nx = col * noiseScale
          const ny = row * noiseScale
          const n = fbm(nx, ny, t)

          if (n < cutoff) continue

          // Base intensity: cutoff..1 → 0..1, then power curve for contrast
          const linear = (n - cutoff) / (1 - cutoff)
          const normalized = linear * linear // push dim pixels darker, bright pixels brighter

          // Local oscillation: high-freq shimmer that pushes pixels toward
          // extremes. Intensity scales with how bright this region already is
          // so dim edges stay calm while hot zones crackle.
          const osc = localOsc(nx, ny, t) // -1..1
          const shimmer = normalized + osc * normalized * 0.8
          // Clamp back to 0..1
          const clamped = Math.max(0, Math.min(1, shimmer))

          const alpha = minAlpha + clamped * (maxAlpha - minAlpha)
          if (alpha < 0.01) continue

          const a = Math.floor(Math.min(alpha, 1) * 255)
            .toString(16)
            .padStart(2, "0")
          c2d.fillStyle = `${pixelColor}${a}`
          c2d.fillRect(col * step, row * step, pixelSize, pixelSize)
        }
      }

      rafRef.current = requestAnimationFrame(renderLoop)
    }

    rafRef.current = requestAnimationFrame(renderLoop)

    return () => {
      cancelAnimationFrame(rafRef.current)
      if (resizeObserver) resizeObserver.disconnect()
      else window.removeEventListener("resize", onResize)
    }
  }, [bgColor, pixelColor, pixelSize, pixelSpacing, noiseScale, speed, minAlpha, maxAlpha, cutoff, glow, contained])

  if (contained) {
    return (
      <canvas
        ref={canvasRef}
        className={`absolute inset-0 w-full h-full ${className}`}
        style={{ display: "block", backgroundColor: "transparent" }}
      />
    )
  }

  return (
    <canvas
      ref={canvasRef}
      className={`fixed inset-0 w-full h-full ${className}`}
      style={{
        display: "block",
        backgroundColor: "transparent",
        width: "100vw",
        height: "100vh",
      }}
    />
  )
}
