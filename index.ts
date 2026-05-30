/**
 * winswitcher.ts
 *
 * A background window switcher for Windows using koffi + Win32 APIs.
 *
 * SLOTS:
 *   Ctrl+Alt+1..9  - assign the current foreground window to slot N
 *   Alt+1..9       - jump to the window in slot N
 */

import koffi from "koffi";
import { Buffer } from "node:buffer";
import process from "node:process";

type SlotEntry = {
  hwnd: unknown;
  title: string;
};

// ---------------------------------------------------------------------------
// Win32 types
// ---------------------------------------------------------------------------

const HWND = koffi.pointer("HWND", koffi.opaque());
const BOOL = "int";
const UINT = "uint32";
const WPARAM = "uint64";
const LPARAM = "int64";

// MSG struct - needed for the message pump
const MSG = koffi.struct("MSG", {
  hwnd: HWND,
  message: UINT,
  wParam: WPARAM,
  lParam: LPARAM,
  time: "uint32",
  ptX: "int32",
  ptY: "int32",
});

// ---------------------------------------------------------------------------
// Load user32.dll
// ---------------------------------------------------------------------------

const user32 = koffi.load("user32.dll");

const RegisterHotKey = user32.func("RegisterHotKey", BOOL, [
  HWND,
  "int",
  UINT,
  UINT,
]);
const UnregisterHotKey = user32.func("UnregisterHotKey", BOOL, [HWND, "int"]);
const GetForegroundWindow = user32.func("GetForegroundWindow", HWND, []);
const SetForegroundWindow = user32.func("SetForegroundWindow", BOOL, [HWND]);
const IsWindow = user32.func("IsWindow", BOOL, [HWND]);
const IsIconic = user32.func("IsIconic", BOOL, [HWND]);
const ShowWindow = user32.func("ShowWindow", BOOL, [HWND, "int"]);
const GetMessageW = user32.func("GetMessageW", BOOL, [
  koffi.out(koffi.pointer(MSG)),
  HWND,
  UINT,
  UINT,
]);
const TranslateMessage = user32.func("TranslateMessage", BOOL, [
  koffi.pointer(MSG),
]);
const DispatchMessageW = user32.func("DispatchMessageW", LPARAM, [
  koffi.pointer(MSG),
]);
const GetWindowTextW = user32.func("GetWindowTextW", "int", [
  HWND,
  koffi.out("char16 *"),
  "int",
]);

function getWindowTitle(hwnd: unknown): string {
  const buf = Buffer.alloc(512);
  const len = Number(GetWindowTextW(hwnd, buf, 256));
  return buf.slice(0, len * 2).toString("utf16le");
}

// ---------------------------------------------------------------------------
// Virtual-key codes & modifier flags
// ---------------------------------------------------------------------------

const MOD_ALT = 0x0001;
const MOD_CONTROL = 0x0002;
const MOD_SHIFT = 0x0004;
const MOD_WIN = 0x0008;
const SW_RESTORE = 9;
const WM_HOTKEY = 0x0312;

// Configure this at the top of the file.
const ACTIVATION_CHORD = "ctrl+alt+r";

type HotkeyAction =
  | {
      kind: "activate-recording";
    }
  | {
      kind: "record-candidate";
      combo: string;
    }
  | {
      kind: "jump-binding";
      combo: string;
    };

type WindowBinding = {
  hwnd: unknown;
  title: string;
};

const hotkeyActions = new Map<number, HotkeyAction>();
const bindings = new Map<string, WindowBinding>();
const jumpHotkeyIdsByCombo = new Map<string, number>();
const recordingHotkeyIds = new Set<number>();

let nextHotkeyId = 1;
let activationHotkeyId = -1;
let isRecording = false;
let pendingRecordingTarget: WindowBinding | null = null;

function parseHotkeyCombo(
  combo: string,
): { modifiers: number; vk: number; normalized: string } | null {
  const parts = combo
    .split("+")
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

  if (parts.length < 2) {
    return null;
  }

  const key = parts[parts.length - 1];
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

  let vk = -1;
  if (/^[0-9]$/.test(key)) {
    vk = key.charCodeAt(0);
  } else if (/^[a-z]$/.test(key)) {
    vk = key.toUpperCase().charCodeAt(0);
  } else {
    const functionMatch = /^f([1-9]|1[0-9]|2[0-4])$/.exec(key);
    if (functionMatch) {
      const fn = Number(functionMatch[1]);
      vk = 0x70 + (fn - 1);
    }
  }

  if (vk < 0 || modMask === 0) {
    return null;
  }

  const canonicalModifiers = ["ctrl", "alt", "shift", "win"].filter((mod) =>
    normalizedModifiers.includes(mod),
  );
  const normalizedKey = key.length === 1 ? key.toLowerCase() : key;

  return {
    modifiers: modMask,
    vk,
    normalized: `${canonicalModifiers.join("+")}+${normalizedKey}`,
  };
}

function registerHotkeyAction(
  combo: string,
  action: HotkeyAction,
): number | null {
  const parsed = parseHotkeyCombo(combo);
  if (!parsed) {
    console.warn(`[warn] Invalid combo "${combo}".`);
    return null;
  }

  const id = nextHotkeyId;
  nextHotkeyId += 1;

  const ok = Number(RegisterHotKey(null, id, parsed.modifiers, parsed.vk));
  if (!ok) {
    console.warn(`[warn] Could not register ${combo} (already in use?)`);
    return null;
  }

  hotkeyActions.set(id, action);
  return id;
}

function unregisterHotkeyById(id: number): void {
  UnregisterHotKey(null, id);
  hotkeyActions.delete(id);
}

function buildRecordingCombos(): string[] {
  const keys: string[] = [];

  for (let n = 0; n <= 9; n++) {
    keys.push(String(n));
  }

  for (let code = 65; code <= 90; code++) {
    keys.push(String.fromCharCode(code).toLowerCase());
  }

  for (let fn = 1; fn <= 12; fn++) {
    keys.push(`f${fn}`);
  }

  const modifiers = ["ctrl", "alt", "shift", "win"];
  const combos: string[] = [];

  for (let mask = 1; mask < 16; mask++) {
    const parts: string[] = [];
    for (let i = 0; i < modifiers.length; i++) {
      if (mask & (1 << i)) {
        parts.push(modifiers[i]);
      }
    }
    const prefix = parts.join("+");

    for (const key of keys) {
      combos.push(`${prefix}+${key}`);
    }
  }

  return combos;
}

const RECORDING_COMBOS = buildRecordingCombos();

function registerActivationHotkey(): void {
  const id = registerHotkeyAction(ACTIVATION_CHORD, {
    kind: "activate-recording",
  });
  if (id == null) {
    console.error(
      `[error] Failed to register activation chord ${ACTIVATION_CHORD}. Exiting.`,
    );
    process.exit(1);
  }
  activationHotkeyId = id;
}

function registerJumpHotkeys(): void {
  for (const combo of bindings.keys()) {
    const id = registerHotkeyAction(combo, {
      kind: "jump-binding",
      combo,
    });
    if (id != null) {
      jumpHotkeyIdsByCombo.set(combo, id);
    }
  }
}

function unregisterJumpHotkeys(): void {
  for (const id of jumpHotkeyIdsByCombo.values()) {
    unregisterHotkeyById(id);
  }
  jumpHotkeyIdsByCombo.clear();
}

function registerRecordingHotkeys(): void {
  const activation = parseHotkeyCombo(ACTIVATION_CHORD)?.normalized;

  for (const combo of RECORDING_COMBOS) {
    const normalized = parseHotkeyCombo(combo)?.normalized;
    if (!normalized || normalized === activation) {
      continue;
    }

    const id = registerHotkeyAction(combo, {
      kind: "record-candidate",
      combo: normalized,
    });
    if (id != null) {
      recordingHotkeyIds.add(id);
    }
  }
}

function unregisterRecordingHotkeys(): void {
  for (const id of recordingHotkeyIds) {
    unregisterHotkeyById(id);
  }
  recordingHotkeyIds.clear();
}

function registerHotkeys(): void {
  registerActivationHotkey();
  registerJumpHotkeys();

  console.log("[winswitcher] Hotkeys registered.");
  console.log(`  activation chord: ${ACTIVATION_CHORD}`);
  console.log(
    "  press activation chord, then the next chord to bind current window",
  );
}

function unregisterHotkeys(): void {
  for (const id of [...hotkeyActions.keys()]) {
    unregisterHotkeyById(id);
  }
  jumpHotkeyIdsByCombo.clear();
  recordingHotkeyIds.clear();
}

function restoreAndFocusWindow(binding: WindowBinding, combo: string): void {
  if (!Number(IsWindow(binding.hwnd))) {
    console.log(
      `[binding ${combo}] Window "${binding.title}" no longer exists, clearing binding.`,
    );
    bindings.delete(combo);
    const jumpId = jumpHotkeyIdsByCombo.get(combo);
    if (jumpId != null) {
      unregisterHotkeyById(jumpId);
      jumpHotkeyIdsByCombo.delete(combo);
    }
    return;
  }

  if (Number(IsIconic(binding.hwnd))) {
    ShowWindow(binding.hwnd, SW_RESTORE);
  }

  const ok = Number(SetForegroundWindow(binding.hwnd));
  if (ok) {
    console.log(`[binding ${combo}] Switched to "${binding.title}"`);
  } else {
    console.warn(
      `[binding ${combo}] SetForegroundWindow failed for "${binding.title}"`,
    );
  }
}

function printBindings(): void {
  console.log("\n[winswitcher] Current bindings:");
  if (bindings.size === 0) {
    console.log("  (none)");
  } else {
    for (const [combo, binding] of bindings) {
      console.log(`  ${combo} -> "${binding.title}"`);
    }
  }
  console.log("");
}

function startRecording(): void {
  if (isRecording) {
    return;
  }

  const hwnd = GetForegroundWindow();
  if (!hwnd) {
    console.warn("[warn] No foreground window found to bind.");
    return;
  }

  const title = getWindowTitle(hwnd);
  pendingRecordingTarget = { hwnd, title };
  isRecording = true;

  unregisterJumpHotkeys();
  registerRecordingHotkeys();

  console.log(`[recording] Capturing next chord for "${title}"...`);
}

function stopRecording(): void {
  if (!isRecording) {
    return;
  }

  unregisterRecordingHotkeys();
  registerJumpHotkeys();
  isRecording = false;
  pendingRecordingTarget = null;
}

function recordBinding(combo: string): void {
  if (!isRecording || !pendingRecordingTarget) {
    return;
  }

  bindings.set(combo, pendingRecordingTarget);
  console.log(
    `[recording] Bound ${combo} -> "${pendingRecordingTarget.title}"`,
  );

  stopRecording();
  printBindings();
}

function runMessageLoop(): void {
  const msg: {
    message?: number;
    wParam?: number;
  } = {};

  // GetMessageW returns 0 on WM_QUIT, -1 on error, otherwise truthy
  while (true) {
    const ret = Number(GetMessageW(msg, null, 0, 0));

    if (ret === 0) {
      break;
    }
    if (ret === -1) {
      console.error("[error] GetMessageW returned -1");
      break;
    }

    if (msg.message === WM_HOTKEY) {
      const id = Number(msg.wParam ?? -1);

      const action = hotkeyActions.get(id);
      if (!action) {
        continue;
      }

      if (action.kind === "activate-recording") {
        startRecording();
      } else if (action.kind === "record-candidate") {
        recordBinding(action.combo);
      } else if (!isRecording) {
        const binding = bindings.get(action.combo);
        if (binding) {
          restoreAndFocusWindow(binding, action.combo);
        }
      }
    }

    TranslateMessage(msg);
    DispatchMessageW(msg);
  }
}

function shutdown(): void {
  console.log("\n[winswitcher] Shutting down, unregistering hotkeys...");
  unregisterHotkeys();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("[winswitcher] Starting...");
registerHotkeys();
printBindings();
runMessageLoop();
