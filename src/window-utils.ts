import { Buffer } from "node:buffer";
import {
  GetForegroundWindow,
  GetWindowTextW,
  IsIconic,
  IsWindow,
  SetForegroundWindow,
  ShowWindow,
} from "./koffi-utils.js";

export type WindowInfo = {
  handle: unknown;
  name: string;
};

export type ActivateWindowResult = "activated" | "missing" | "failed";

const SW_RESTORE = 9;

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
  }

  if (Number(SetForegroundWindow(handle)) !== 0) {
    return "activated";
  }

  return "failed";
}
