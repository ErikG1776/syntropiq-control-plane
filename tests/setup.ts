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

// Stub localStorage – jsdom may provide one but its .clear() can be broken
// when --localstorage-file is not configured, so we always install a safe shim.
const store: Record<string, string> = {}
const localStorageShim = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, val: string) => { store[key] = val },
  removeItem: (key: string) => { delete store[key] },
  clear: () => { for (const k of Object.keys(store)) delete store[k] },
  get length() { return Object.keys(store).length },
  key: (i: number) => Object.keys(store)[i] ?? null,
}

Object.defineProperty(globalThis, "localStorage", {
  value: localStorageShim,
  writable: true,
  configurable: true,
})

afterEach(() => {
  localStorageShim.clear()
})
