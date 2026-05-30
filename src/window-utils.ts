import { Buffer } from "node:buffer";
import {
  AttachThreadInput,
  BringWindowToTop,
  GetForegroundWindow,
  GetCurrentThreadId,
  GetWindowThreadProcessId,
  GetWindowTextW,
  IsIconic,
  IsWindow,
  SetActiveWindow,
  SetForegroundWindow,
  ShowWindow,
} from "./koffi-utils.js";

export type WindowInfo = {
  handle: unknown;
  name: string;
};

export type ActivateWindowResult = "activated" | "missing" | "failed";

const SW_RESTORE = 9;
const SW_SHOW = 5;

function getWindowTitle(hwnd: unknown): string {
  const buf = Buffer.alloc(512);
  const len = Number(GetWindowTextW(hwnd, buf, 256));
  return buf.slice(0, len * 2).toString("utf16le");
}

export function getActiveWindowHandleAndName(): WindowInfo | null {
  const hwnd = GetForegroundWindow();
  if (!hwnd) {
    return null;
  }

  return {
    handle: hwnd,
    name: getWindowTitle(hwnd),
  };
}

export function activateWindowByHandle(handle: unknown): ActivateWindowResult {
  if (!Number(IsWindow(handle))) {
    return "missing";
  }

  if (Number(IsIconic(handle))) {
    ShowWindow(handle, SW_RESTORE);
  } else {
    ShowWindow(handle, SW_SHOW);
  }

  // Fast path for windows that can be foregrounded immediately.
  if (Number(SetForegroundWindow(handle)) !== 0) {
    return "activated";
  }

  const currentThreadId = Number(GetCurrentThreadId());
  const foreground = GetForegroundWindow();
  const foregroundThreadId = foreground
    ? Number(GetWindowThreadProcessId(foreground, null))
    : 0;
  const targetThreadId = Number(GetWindowThreadProcessId(handle, null));

  const attachedThreadIds: number[] = [];
  const tryAttach = (threadId: number) => {
    if (threadId && threadId !== currentThreadId) {
      const ok = Number(AttachThreadInput(currentThreadId, threadId, 1));
      if (ok) {
        attachedThreadIds.push(threadId);
      }
    }
  };

  try {
    tryAttach(foregroundThreadId);
    tryAttach(targetThreadId);

    BringWindowToTop(handle);
    SetActiveWindow(handle);
    ShowWindow(handle, SW_SHOW);

    if (Number(SetForegroundWindow(handle)) !== 0) {
      return "activated";
    }
  } finally {
    for (const threadId of attachedThreadIds) {
      AttachThreadInput(currentThreadId, threadId, 0);
    }
  }

  return "failed";
}
