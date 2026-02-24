import { afterEach } from "vitest"

// Minimal jsdom polyfills for Zustand / RAF-gated store
if (typeof globalThis.requestAnimationFrame === "undefined") {
  globalThis.requestAnimationFrame = (cb: FrameRequestCallback) => {
    return setTimeout(() => cb(Date.now()), 0) as unknown as number
  }
}

if (typeof globalThis.cancelAnimationFrame === "undefined") {
  globalThis.cancelAnimationFrame = (id: number) => clearTimeout(id)
}

// Stub localStorage
const store: Record<string, string> = {}
if (typeof globalThis.localStorage === "undefined") {
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, val: string) => { store[key] = val },
      removeItem: (key: string) => { delete store[key] },
      clear: () => { for (const k of Object.keys(store)) delete store[k] },
    },
  })
}

afterEach(() => {
  localStorage.clear()
})
