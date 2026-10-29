import test from "node:test";
import assert from "node:assert/strict";
import { getInboxVisualViewport, observeInboxVisualViewport } from "../lib/inbox-viewport.ts";

test("full-screen thread follows visible keyboard space rather than the layout height", () => {
  assert.deepEqual(getInboxVisualViewport(390, 844, { height: 482, offsetTop: 0, scale: 1 }), { height: 482, top: 0 });
});
test("browser panning offsets the thread without overflowing the layout bottom", () => {
  assert.deepEqual(getInboxVisualViewport(390, 844, { height: 482.8, offsetTop: 86.9, scale: 1 }), { height: 482, top: 86 });
  assert.deepEqual(getInboxVisualViewport(390, 844, { height: 800, offsetTop: 100, scale: 1 }), { height: 744, top: 100 });
});
test("closing the keyboard restores the full visible screen including orientation changes", () => {
  assert.deepEqual(getInboxVisualViewport(390, 844, { height: 844, offsetTop: 0, scale: 1 }), { height: 844, top: 0 });
  assert.deepEqual(getInboxVisualViewport(844, 390, { height: 220, offsetTop: 0, scale: 1 }), { height: 220, top: 0 });
});
test("desktop and missing APIs retain existing CSS behavior", () => {
  assert.equal(getInboxVisualViewport(1280, 900, { height: 600, offsetTop: 0, scale: 1 }), null);
  assert.equal(getInboxVisualViewport(390, 844, null), null);
});
test("pinch zoom does not trigger a layout resize or disable browser zoom", () => {
  assert.equal(getInboxVisualViewport(390, 844, { height: 422, offsetTop: 30, scale: 2 }), null);
  assert.equal(getInboxVisualViewport(390, 844, { height: 900, offsetTop: 0, scale: 0.8 }), null);
});
test("transient and invalid viewport metrics cannot create a negative or non-finite thread", () => {
  for (const geometry of [{ height: 0, offsetTop: 0, scale: 1 }, { height: NaN, offsetTop: 0, scale: 1 },
    { height: 400, offsetTop: Infinity, scale: 1 }, { height: 400, offsetTop: 900, scale: 1 }]) {
    assert.equal(getInboxVisualViewport(390, 844, geometry), null);
  }
  assert.deepEqual(getInboxVisualViewport(390, 844, { height: 482, offsetTop: -1, scale: 1 }), { height: 482, top: 0 });
});

function fixture() {
  const properties = new Map<string, { value: string; priority: string }>();
  const listeners = new Map<string, Set<() => void>>();
  const frames = new Map<number, () => void>();
  let sequence = 0;
  const events = (prefix: string) => ({
    addEventListener(name: string, callback: () => void) {
      const key = `${prefix}:${name}`;
      if (!listeners.has(key)) listeners.set(key, new Set());
      listeners.get(key)!.add(callback);
    },
    removeEventListener(name: string, callback: () => void) { listeners.get(`${prefix}:${name}`)?.delete(callback); },
  });
  const viewport = { height: 482, offsetTop: 20, scale: 1, ...events("visual") };
  const host = { innerWidth: 390, innerHeight: 844, visualViewport: viewport, ...events("window"),
    requestAnimationFrame(callback: () => void) { const id = ++sequence; frames.set(id, callback); return id; },
    cancelAnimationFrame(id: number) { frames.delete(id); },
  };
  const element = { style: {
    getPropertyValue: (key: string) => properties.get(key)?.value || "",
    getPropertyPriority: (key: string) => properties.get(key)?.priority || "",
    setProperty: (key: string, value: string | null, priority = "") => { properties.set(key, { value: value || "", priority }); },
    removeProperty: (key: string) => { const previous = properties.get(key)?.value || ""; properties.delete(key); return previous; },
  } };
  const emit = (key: string) => listeners.get(key)?.forEach((callback) => callback());
  const flush = () => { const scheduled = [...frames.values()]; frames.clear(); scheduled.forEach((callback) => callback()); };
  return { host, element, properties, frames, listeners, emit, flush, viewport };
}

test("visual resize and pan events coalesce and read the latest geometry", () => {
  const f = fixture();
  const cleanup = observeInboxVisualViewport(f.element, f.host as unknown as Window);
  assert.equal(f.element.style.getPropertyValue("--inbox-viewport-height"), "482px");
  f.viewport.height = 400; f.emit("visual:resize");
  f.viewport.offsetTop = 40; f.emit("visual:scroll"); f.emit("window:resize");
  assert.equal(f.frames.size, 1);
  f.flush();
  assert.equal(f.element.style.getPropertyValue("--inbox-viewport-height"), "400px");
  assert.equal(f.element.style.getPropertyValue("--inbox-viewport-top"), "40px");
  cleanup();
});

test("unmount cancels pending work, unsubscribes every event and restores previous styles", () => {
  const f = fixture();
  f.element.style.setProperty("--inbox-viewport-top", "7px", "important");
  const cleanup = observeInboxVisualViewport(f.element, f.host as unknown as Window);
  f.emit("visual:resize");
  cleanup();
  assert.equal(f.frames.size, 0);
  assert.equal([...f.listeners.values()].every((set) => set.size === 0), true);
  assert.equal(f.element.style.getPropertyValue("--inbox-viewport-height"), "");
  assert.deepEqual(f.properties.get("--inbox-viewport-top"), { value: "7px", priority: "important" });
  f.emit("visual:scroll"); f.flush();
  assert.equal(f.frames.size, 0);
});

test("switching to desktop or pinch zoom releases the mobile override", () => {
  const f = fixture();
  const cleanup = observeInboxVisualViewport(f.element, f.host as unknown as Window);
  f.host.innerWidth = 1280; f.emit("window:resize"); f.flush();
  assert.equal(f.element.style.getPropertyValue("--inbox-viewport-height"), "");
  f.host.innerWidth = 390; f.viewport.scale = 2; f.emit("visual:resize"); f.flush();
  assert.equal(f.element.style.getPropertyValue("--inbox-viewport-top"), "");
  f.viewport.scale = 1; f.emit("visual:resize"); f.flush();
  assert.equal(f.element.style.getPropertyValue("--inbox-viewport-height"), "482px");
  cleanup();
});
