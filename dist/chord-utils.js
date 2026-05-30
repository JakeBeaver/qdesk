import { CallNextHookEx, decodeKeyboardHookLParam, DispatchMessageW, GetAsyncKeyState, GetMessageW, GetModuleHandleW, registerKeyboardHookCallback, SetWindowsHookExW, TranslateMessage, UnhookWindowsHookEx, unregisterCallback, } from "./koffi-utils.js";
const MOD_ALT = 0x0001;
const MOD_CONTROL = 0x0002;
const MOD_SHIFT = 0x0004;
const MOD_WIN = 0x0008;
const VK_SHIFT = 0x10;
const VK_CONTROL = 0x11;
const VK_MENU = 0x12;
const VK_LWIN = 0x5b;
const VK_RWIN = 0x5c;
const HC_ACTION = 0;
const WH_KEYBOARD_LL = 13;
const WM_KEYDOWN = 0x0100;
const WM_SYSKEYDOWN = 0x0104;
function normalizeChord(chord) {
    const parts = chord
        .split("+")
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean);
    if (parts.length < 2) {
        return null;
    }
    const key = parts[parts.length - 1];
    if (!/^[0-9a-z]$/.test(key) && !/^f([1-9]|1[0-9]|2[0-4])$/.test(key)) {
        return null;
    }
    const modifiers = new Set(parts.slice(0, -1));
    for (const mod of modifiers) {
        if (!["ctrl", "control", "alt", "shift", "win", "meta"].includes(mod)) {
            return null;
        }
    }
    const normalizedMods = [];
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
    if (normalizedMods.length === 0) {
        return null;
    }
    return `${normalizedMods.join("+")}+${key}`;
}
function parseHotkeyCombo(combo) {
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
    const normalizedModifiers = [];
    for (const mod of modifiers) {
        if (mod === "alt") {
            modMask |= MOD_ALT;
            normalizedModifiers.push("alt");
        }
        else if (mod === "ctrl" || mod === "control") {
            modMask |= MOD_CONTROL;
            normalizedModifiers.push("ctrl");
        }
        else if (mod === "shift") {
            modMask |= MOD_SHIFT;
            normalizedModifiers.push("shift");
        }
        else if (mod === "win" || mod === "meta") {
            modMask |= MOD_WIN;
            normalizedModifiers.push("win");
        }
        else {
            return null;
        }
    }
    let vk = -1;
    if (/^[0-9]$/.test(key)) {
        vk = key.charCodeAt(0);
    }
    else if (/^[a-z]$/.test(key)) {
        vk = key.toUpperCase().charCodeAt(0);
    }
    else {
        const functionMatch = /^f([1-9]|1[0-9]|2[0-4])$/.exec(key);
        if (functionMatch) {
            const fn = Number(functionMatch[1]);
            vk = 0x70 + (fn - 1);
        }
    }
    if (vk < 0 || modMask === 0) {
        return null;
    }
    const canonicalModifiers = ["ctrl", "alt", "shift", "win"].filter((mod) => normalizedModifiers.includes(mod));
    return {
        modifiers: modMask,
        vk,
        normalized: `${canonicalModifiers.join("+")}+${key}`,
    };
}
function isPressed(vk) {
    return (Number(GetAsyncKeyState(vk)) & 0x8000) !== 0;
}
function vkToKeyToken(vkCode) {
    if (vkCode >= 0x30 && vkCode <= 0x39) {
        return String.fromCharCode(vkCode);
    }
    if (vkCode >= 0x41 && vkCode <= 0x5a) {
        return String.fromCharCode(vkCode).toLowerCase();
    }
    if (vkCode >= 0x70 && vkCode <= 0x87) {
        return `f${vkCode - 0x6f}`;
    }
    return null;
}
function buildCurrentChord(vkCode) {
    const key = vkToKeyToken(vkCode);
    if (!key) {
        return null;
    }
    const parts = [];
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
    if (parts.length === 0) {
        return null;
    }
    return `${parts.join("+")}+${key}`;
}
export function startListening(options) {
    const activationNormalized = options.activationChord
        ? normalizeChord(options.activationChord)
        : null;
    if (options.activationChord && !activationNormalized) {
        console.error(`[error] Invalid activation chord: ${options.activationChord}`);
        process.exit(1);
    }
    let keyboardHook = null;
    let keyboardHookProcPtr = null;
    const callback = (nCode, wParam, lParam) => {
        const passThrough = () => BigInt(Number(CallNextHookEx(keyboardHook, nCode, wParam, lParam)));
        try {
            if (nCode !== HC_ACTION) {
                return passThrough();
            }
            const message = Number(wParam);
            if (message !== WM_KEYDOWN && message !== WM_SYSKEYDOWN) {
                return passThrough();
            }
            const kb = decodeKeyboardHookLParam(lParam);
            const combo = buildCurrentChord(Number(kb.vkCode));
            if (!combo) {
                return passThrough();
            }
            let shouldStopPropagation = false;
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
        }
        catch (error) {
            console.error("[error] Keyboard hook callback failed:", error);
            return passThrough();
        }
    };
    keyboardHookProcPtr = registerKeyboardHookCallback(callback);
    const moduleHandle = GetModuleHandleW(null);
    keyboardHook = SetWindowsHookExW(WH_KEYBOARD_LL, keyboardHookProcPtr, moduleHandle, 0);
    if (!keyboardHook) {
        console.error("[error] SetWindowsHookExW failed.");
        process.exit(1);
    }
    function shutdown() {
        console.log("\n[winswitcher] Shutting down...");
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
    return {
        runMessageLoop: () => {
            const msg = {};
            while (true) {
                const ret = Number(GetMessageW(msg, null, 0, 0));
                if (ret === 0) {
                    break;
                }
                if (ret === -1) {
                    console.error("[error] GetMessageW returned -1");
                    break;
                }
                TranslateMessage(msg);
                DispatchMessageW(msg);
            }
        },
    };
}
