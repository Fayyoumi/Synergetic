"use client";

import { useSyncExternalStore } from "react";

/**
 * Tiny sound effects, synthesised with Web Audio (no audio files to download).
 * On by default; the choice is remembered per device.
 */

export type SoundKind = "correct" | "wrong" | "tick" | "reveal" | "join";

const KEY = "sahra:sound";
let ctx: AudioContext | null = null;
const listeners = new Set<() => void>();

function enabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundEnabled(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "on" : "off");
  } catch {
    // ignore
  }
  listeners.forEach((l) => l());
}

export function useSoundEnabled(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    enabled,
    () => false,
  );
}

function tone(c: AudioContext, freq: number, start: number, dur: number, type: OscillatorType, gain: number) {
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, c.currentTime + start);
  g.gain.exponentialRampToValueAtTime(gain, c.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  osc.connect(g).connect(c.destination);
  osc.start(c.currentTime + start);
  osc.stop(c.currentTime + start + dur + 0.02);
}

/** Plays a short effect if sound is on and the browser allows audio. Never throws. */
export function playSound(kind: SoundKind) {
  if (typeof window === "undefined" || !enabled()) return;
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    ctx ??= new AC();
    if (ctx.state === "suspended") void ctx.resume();
    const c = ctx;
    switch (kind) {
      case "correct":
        tone(c, 660, 0, 0.12, "triangle", 0.25);
        tone(c, 990, 0.1, 0.18, "triangle", 0.25);
        break;
      case "wrong":
        tone(c, 180, 0, 0.3, "sawtooth", 0.12);
        break;
      case "tick":
        tone(c, 1200, 0, 0.04, "square", 0.05);
        break;
      case "reveal":
        tone(c, 523, 0, 0.25, "triangle", 0.2);
        tone(c, 659, 0.08, 0.25, "triangle", 0.2);
        tone(c, 784, 0.16, 0.35, "triangle", 0.2);
        break;
      case "join":
        tone(c, 880, 0, 0.08, "sine", 0.15);
        break;
    }
  } catch {
    // audio is a nice-to-have
  }
}
