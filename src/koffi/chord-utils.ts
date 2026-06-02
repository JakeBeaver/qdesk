import { GetAsyncKeyState } from "./koffi-utils.js";

const MOD_ALT = 0x0001;
const MOD_CONTROL = 0x0002;
const MOD_SHIFT = 0x0004;
const MOD_WIN = 0x0008;

const VK_SHIFT = 0x10;
const VK_CONTROL = 0x11;
const VK_MENU = 0x12;
export const VK_ESCAPE = 0x1b;
const VK_LWIN = 0x5b;
const VK_RWIN = 0x5c;

export const HC_ACTION = 0;
export const WH_KEYBOARD_LL = 13;
export const WM_KEYDOWN = 0x0100;
export const WM_SYSKEYDOWN = 0x0104;
export const PM_REMOVE = 0x0001;

export type StartListeningOptions = {
  activationChord?: string;
  onActivation?: (stopPropagating: () => void) => void;
  onEscape?: (stopPropagating: () => void) => void;
  onChord: (chord: string, stopPropagating: () => void) => void;
};

const VK_TOKEN_TO_CODE: Record<string, number> = {
  backspace: 0x08,
  tab: 0x09,
  clear: 0x0c,
  enter: 0x0d,
  return: 0x0d,
  pause: 0x13,
  capslock: 0x14,
  esc: VK_ESCAPE,
  escape: VK_ESCAPE,
  space: 0x20,
  pageup: 0x21,
  pagedown: 0x22,
  end: 0x23,
  home: 0x24,
  left: 0x25,
  up: 0x26,
  right: 0x27,
  down: 0x28,
  printscreen: 0x2c,
  prtsc: 0x2c,
  snapshot: 0x2c,
  insert: 0x2d,
  delete: 0x2e,
  num0: 0x60,
  num1: 0x61,
  num2: 0x62,
  num3: 0x63,
  num4: 0x64,
  num5: 0x65,
  num6: 0x66,
  num7: 0x67,
  num8: 0x68,
  num9: 0x69,
  num_mul: 0x6a,
  num_add: 0x6b,
  num_sub: 0x6d,
  num_dec: 0x6e,
  num_div: 0x6f,
};

const VK_CODE_TO_TOKEN = new Map<number, string>(
  Object.entries(VK_TOKEN_TO_CODE).map(([token, code]) => [code, token]),
);
VK_CODE_TO_TOKEN.set(VK_ESCAPE, "esc");
VK_CODE_TO_TOKEN.set(0x0d, "enter");
VK_CODE_TO_TOKEN.set(0x2c, "printscreen");

const MODIFIER_TOKENS = new Set([
  "ctrl",
  "control",
  "alt",
  "shift",
  "win",
  "meta",
]);

function normalizeKeyToken(rawKey: string): string | null {
  const key = rawKey.trim().toLowerCase();
  if (!key) {
    return null;
  }

  if (/^[0-9a-z]$/.test(key)) {
    return key;
  }

  if (/^f([1-9]|1[0-9]|2[0-4])$/.test(key)) {
    return key;
  }

  if (VK_TOKEN_TO_CODE[key] !== undefined) {
    return VK_CODE_TO_TOKEN.get(VK_TOKEN_TO_CODE[key]) ?? key;
  }

  return null;
}

function keyTokenToVk(key: string): number {
  if (/^[0-9]$/.test(key)) {
    return key.charCodeAt(0);
  }
  if (/^[a-z]$/.test(key)) {
    return key.toUpperCase().charCodeAt(0);
  }

  const functionMatch = /^f([1-9]|1[0-9]|2[0-4])$/.exec(key);
  if (functionMatch) {
    const fn = Number(functionMatch[1]);
    return 0x70 + (fn - 1);
  }

  return VK_TOKEN_TO_CODE[key] ?? -1;
}

export function normalizeChord(chord: string): string | null {
  chord = chord.trim().toLowerCase();
  const parts = chord
    .split("+")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

  if (parts.length === 0) {
    return null;
  }

  const key = normalizeKeyToken(parts[parts.length - 1]);
  if (!key) {
    return null;
  }

  const modifiers = new Set(parts.slice(0, -1));
  for (const mod of modifiers) {
    if (!MODIFIER_TOKENS.has(mod)) {
      return null;
    }
  }

  const normalizedMods: string[] = [];
  if (modifiers.has("ctrl") || modifiers.has("control")) {
    normalizedMods.push("ctrl");
  }
  if (modifiers.has("alt")) {
    normalizedMods.push("alt");
  }
  if (modifiers.has("shift")) {
    normalizedMods.push("shift");
  }
  if (modifiers.has("win") || modifiers.has("meta")) {
    normalizedMods.push("win");
  }

  return normalizedMods.length > 0 ? `${normalizedMods.join("+")}+${key}` : key;
}

export function parseHotkeyCombo(combo: string): {
  modifiers: number;
  vk: number;
  normalized: string;
} | null {
  const parts = combo
    .split("+")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

  if (parts.length === 0) {
    return null;
  }

  const key = normalizeKeyToken(parts[parts.length - 1]);
  if (!key) {
    return null;
  }

  const modifiers = parts.slice(0, -1);

  let modMask = 0;
  const normalizedModifiers: string[] = [];

  for (const mod of modifiers) {
    if (mod === "alt") {
      modMask |= MOD_ALT;
      normalizedModifiers.push("alt");
    } else if (mod === "ctrl" || mod === "control") {
      modMask |= MOD_CONTROL;
      normalizedModifiers.push("ctrl");
    } else if (mod === "shift") {
      modMask |= MOD_SHIFT;
      normalizedModifiers.push("shift");
    } else if (mod === "win" || mod === "meta") {
      modMask |= MOD_WIN;
      normalizedModifiers.push("win");
    } else {
      return null;
    }
  }

  const vk = keyTokenToVk(key);

  if (vk < 0) {
    return null;
  }

  const canonicalModifiers = ["ctrl", "alt", "shift", "win"].filter((mod) =>
    normalizedModifiers.includes(mod),
  );

  return {
    modifiers: modMask,
    vk,
    normalized: `${canonicalModifiers.join("+")}+${key}`,
  };
}

function isPressed(vk: number): boolean {
  return (Number(GetAsyncKeyState(vk)) & 0x8000) !== 0;
}

function vkToKeyToken(vkCode: number): string | null {
  if (vkCode >= 0x30 && vkCode <= 0x39) {
    return String.fromCharCode(vkCode);
  }
  if (vkCode >= 0x41 && vkCode <= 0x5a) {
    return String.fromCharCode(vkCode).toLowerCase();
  }
  if (vkCode >= 0x70 && vkCode <= 0x87) {
    return `f${vkCode - 0x6f}`;
  }

  const named = VK_CODE_TO_TOKEN.get(vkCode);
  if (named) {
    return named;
  }

  return null;
}

export function buildCurrentChord(vkCode: number): string | null {
  const key = vkToKeyToken(vkCode);
  if (!key) {
    return null;
  }

  const parts: string[] = [];
  if (isPressed(VK_CONTROL)) {
    parts.push("ctrl");
  }
  if (isPressed(VK_MENU)) {
    parts.push("alt");
  }
  if (isPressed(VK_SHIFT)) {
    parts.push("shift");
  }
  if (isPressed(VK_LWIN) || isPressed(VK_RWIN)) {
    parts.push("win");
  }

  return parts.length > 0 ? `${parts.join("+")}+${key}` : key;
}
