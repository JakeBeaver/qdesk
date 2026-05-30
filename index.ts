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
const SW_RESTORE = 9;
const WM_HOTKEY = 0x0312;

const NUM_SLOTS = 9;

// Hotkey IDs:
//   1-9   -> Alt+N      (jump to slot N)
//  11-19  -> Ctrl+Alt+N (assign slot N)
const ID_JUMP_BASE = 1;
const ID_ASSIGN_BASE = 11;

// slots[0] = slot 1, slots[8] = slot 9
const slots: Array<SlotEntry | null> = new Array(NUM_SLOTS).fill(null);

function registerHotkeys(): void {
  const VK_1 = 0x31;

  for (let i = 0; i < NUM_SLOTS; i++) {
    const vk = VK_1 + i;

    const jumpOk = Number(RegisterHotKey(null, ID_JUMP_BASE + i, MOD_ALT, vk));
    if (!jumpOk) {
      console.warn(`[warn] Could not register Alt+${i + 1} (already in use?)`);
    }

    const assignOk = Number(
      RegisterHotKey(null, ID_ASSIGN_BASE + i, MOD_CONTROL | MOD_ALT, vk),
    );
    if (!assignOk) {
      console.warn(
        `[warn] Could not register Ctrl+Alt+${i + 1} (already in use?)`,
      );
    }
  }

  console.log("[winswitcher] Hotkeys registered.");
  console.log("  Ctrl+Alt+1..9 -> assign current window to slot");
  console.log("  Alt+1..9      -> jump to slot");
}

function unregisterHotkeys(): void {
  for (let i = 0; i < NUM_SLOTS; i++) {
    UnregisterHotKey(null, ID_JUMP_BASE + i);
    UnregisterHotKey(null, ID_ASSIGN_BASE + i);
  }
}

function assignSlot(slotIndex: number): void {
  const hwnd = GetForegroundWindow();
  if (!hwnd) {
    console.log(`[slot ${slotIndex + 1}] No foreground window found.`);
    return;
  }

  const title = getWindowTitle(hwnd);
  slots[slotIndex] = { hwnd, title };
  console.log(`[slot ${slotIndex + 1}] Assigned -> "${title}"`);
}

function jumpToSlot(slotIndex: number): void {
  const slot = slots[slotIndex];
  if (!slot) {
    console.log(
      `[slot ${slotIndex + 1}] Empty - use Ctrl+Alt+${slotIndex + 1} to assign.`,
    );
    return;
  }

  if (!Number(IsWindow(slot.hwnd))) {
    console.log(
      `[slot ${slotIndex + 1}] Window "${slot.title}" no longer exists, clearing slot.`,
    );
    slots[slotIndex] = null;
    return;
  }

  if (Number(IsIconic(slot.hwnd))) {
    ShowWindow(slot.hwnd, SW_RESTORE);
  }

  const ok = Number(SetForegroundWindow(slot.hwnd));
  if (ok) {
    console.log(`[slot ${slotIndex + 1}] Switched to "${slot.title}"`);
  } else {
    console.warn(
      `[slot ${slotIndex + 1}] SetForegroundWindow failed for "${slot.title}"`,
    );
  }
}

function printSlots(): void {
  console.log("\n[winswitcher] Current slots:");
  for (let i = 0; i < NUM_SLOTS; i++) {
    const slot = slots[i];
    console.log(`  ${i + 1}: ${slot ? `"${slot.title}"` : "(empty)"}`);
  }
  console.log("");
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

      if (id >= ID_ASSIGN_BASE && id < ID_ASSIGN_BASE + NUM_SLOTS) {
        assignSlot(id - ID_ASSIGN_BASE);
        printSlots();
      } else if (id >= ID_JUMP_BASE && id < ID_JUMP_BASE + NUM_SLOTS) {
        jumpToSlot(id - ID_JUMP_BASE);
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
printSlots();
runMessageLoop();
