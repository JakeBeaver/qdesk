import {
  HC_ACTION,
  PM_REMOVE,
  StartListeningOptions,
  VK_ESCAPE,
  WH_KEYBOARD_LL,
  WM_KEYDOWN,
  WM_SYSKEYDOWN,
  buildCurrentChord,
  normalizeChord,
} from "./chord-utils.js";
import {
  registerKeyboardHookCallback,
  CallNextHookEx,
  decodeKeyboardHookLParam,
  GetModuleHandleW,
  SetWindowsHookExW,
  UnhookWindowsHookEx,
  unregisterCallback,
  PeekMessageW,
  TranslateMessage,
  DispatchMessageW,
} from "./koffi-utils.js";

export function startListening(options: StartListeningOptions) {
  const activationNormalized = options.activationChord
    ? normalizeChord(options.activationChord)
    : null;

  if (options.activationChord && !activationNormalized) {
    console.error(
      `[error] Invalid activation chord: ${options.activationChord}`,
    );
    process.exit(1);
  }

  let keyboardHook: unknown = null;
  let keyboardHookProcPtr: ReturnType<typeof registerKeyboardHookCallback> =
    null;
  let messagePump: ReturnType<typeof setInterval> | undefined;
  let isShuttingDown = false;

  const callback = (nCode: number, wParam: number, lParam: bigint): bigint => {
    const passThrough = () =>
      BigInt(Number(CallNextHookEx(keyboardHook, nCode, wParam, lParam)));

    try {
      if (nCode !== HC_ACTION) {
        return passThrough();
      }

      const message = Number(wParam);
      if (message !== WM_KEYDOWN && message !== WM_SYSKEYDOWN) {
        return passThrough();
      }

      const kb = decodeKeyboardHookLParam(lParam);
      const vkCode = Number(kb.vkCode);

      let shouldStopPropagation = false;
      if (vkCode === VK_ESCAPE) {
        options.onEscape?.(() => {
          shouldStopPropagation = true;
        });
        if (shouldStopPropagation) {
          return 1n;
        }
      }

      const combo = buildCurrentChord(vkCode);
      if (!combo) {
        return passThrough();
      }

      if (activationNormalized && combo === activationNormalized) {
        options.onActivation?.(() => {
          shouldStopPropagation = true;
        });
      }

      options.onChord(combo, () => {
        shouldStopPropagation = true;
      });

      if (shouldStopPropagation) {
        return 1n;
      }

      return passThrough();
    } catch (error) {
      console.error("[error] Keyboard hook callback failed:", error);
      return passThrough();
    }
  };

  keyboardHookProcPtr = registerKeyboardHookCallback(callback);
  const moduleHandle = GetModuleHandleW(null);
  keyboardHook = SetWindowsHookExW(
    WH_KEYBOARD_LL,
    keyboardHookProcPtr,
    moduleHandle,
    0,
  );

  if (!keyboardHook) {
    console.error("[error] SetWindowsHookExW failed.");
    process.exit(1);
  }

  function shutdown(): void {
    if (isShuttingDown) {
      return;
    }
    isShuttingDown = true;

    console.log("\n[qdesk] Shutting down...");

    if (messagePump) {
      clearInterval(messagePump);
      messagePump = undefined;
    }

    if (keyboardHook) {
      UnhookWindowsHookEx(keyboardHook);
      keyboardHook = null;
    }

    if (keyboardHookProcPtr) {
      unregisterCallback(keyboardHookProcPtr);
      keyboardHookProcPtr = null;
    }
    process.exit(0);
  }

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  const msg: {
    message?: number;
    wParam?: number;
  } = {};

  messagePump = setInterval(() => {
    while (Number(PeekMessageW(msg, null, 0, 0, PM_REMOVE)) !== 0) {
      TranslateMessage(msg);
      DispatchMessageW(msg);
    }
  }, 8);
}
