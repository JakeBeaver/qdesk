import { Buffer } from "node:buffer";
import {
  AttachThreadInput,
  BringWindowToTop,
  GetForegroundWindow,
  GetCurrentThreadId,
  GetWindowThreadProcessId,
  GetWindowTextW,
  IsIconic,
  IsZoomed,
  IsWindow,
  SetActiveWindow,
  SetForegroundWindow,
  ShowWindow,
} from "./koffi-utils.js";

export type WindowInfo = {
  handle: BigInt;
  name: string;
  missing?: boolean;
};

export type ActivateWindowResult = "activated" | "missing" | "failed";

const SW_RESTORE = 9;
const SW_SHOW = 5;
const SW_SHOWMAXIMIZED = 3;

function getWindowTitle(hwnd: BigInt): string {
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

  const showTargetWindow = () => {
    if (Number(IsIconic(handle))) {
      ShowWindow(handle, SW_RESTORE);
      return;
    }

    if (Number(IsZoomed(handle))) {
      ShowWindow(handle, SW_SHOWMAXIMIZED);
      return;
    }

    ShowWindow(handle, SW_SHOW);
  };

  showTargetWindow();

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
    showTargetWindow();

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

export function checkIfWindowExists(handle: unknown): boolean {
  return Boolean(IsWindow(handle));
}
