import koffi from "koffi";
export const HWND = koffi.pointer("HWND", koffi.opaque());
const HHOOK = koffi.pointer("HHOOK", koffi.opaque());
const HINSTANCE = koffi.pointer("HINSTANCE", koffi.opaque());
const UINT = "uint32";
const WPARAM = "uint64";
const LPARAM = "int64";
const MSG = koffi.struct("MSG", {
    hwnd: HWND,
    message: UINT,
    wParam: WPARAM,
    lParam: LPARAM,
    time: "uint32",
    ptX: "int32",
    ptY: "int32",
});
const KBDLLHOOKSTRUCT = koffi.struct("KBDLLHOOKSTRUCT", {
    vkCode: "uint32",
    scanCode: "uint32",
    flags: "uint32",
    time: "uint32",
    dwExtraInfo: "uint64",
});
const KeyboardHookProc = koffi.proto("int64 KeyboardHookProc(int nCode, uint64 wParam, void *lParam)");
const user32 = koffi.load("user32.dll");
const kernel32 = koffi.load("kernel32.dll");
export const GetForegroundWindow = user32.func("GetForegroundWindow", HWND, []);
export const SetForegroundWindow = user32.func("SetForegroundWindow", "int", [
    HWND,
]);
export const IsWindow = user32.func("IsWindow", "int", [HWND]);
export const IsIconic = user32.func("IsIconic", "int", [HWND]);
export const ShowWindow = user32.func("ShowWindow", "int", [HWND, "int"]);
export const BringWindowToTop = user32.func("BringWindowToTop", "int", [HWND]);
export const SetActiveWindow = user32.func("SetActiveWindow", HWND, [HWND]);
export const AttachThreadInput = user32.func("AttachThreadInput", "int", [
    "uint32",
    "uint32",
    "int",
]);
export const GetWindowThreadProcessId = user32.func("GetWindowThreadProcessId", "uint32", [HWND, "void *"]);
export const GetWindowTextW = user32.func("GetWindowTextW", "int", [
    HWND,
    koffi.out("char16 *"),
    "int",
]);
export const GetAsyncKeyState = user32.func("GetAsyncKeyState", "int16", [
    "int",
]);
export const GetMessageW = user32.func("GetMessageW", "int", [
    koffi.out(koffi.pointer(MSG)),
    HWND,
    UINT,
    UINT,
]);
export const TranslateMessage = user32.func("TranslateMessage", "int", [
    koffi.pointer(MSG),
]);
export const DispatchMessageW = user32.func("DispatchMessageW", LPARAM, [
    koffi.pointer(MSG),
]);
export const SetWindowsHookExW = user32.func("SetWindowsHookExW", HHOOK, [
    "int",
    koffi.pointer(KeyboardHookProc),
    HINSTANCE,
    "uint32",
]);
export const CallNextHookEx = user32.func("CallNextHookEx", "int64", [
    HHOOK,
    "int",
    "uint64",
    "void *",
]);
export const UnhookWindowsHookEx = user32.func("UnhookWindowsHookEx", "int", [
    HHOOK,
]);
export const GetModuleHandleW = kernel32.func("GetModuleHandleW", HINSTANCE, [
    "char16 *",
]);
export const GetCurrentThreadId = kernel32.func("GetCurrentThreadId", "uint32", []);
export function decodeKeyboardHookLParam(lParam) {
    return koffi.decode(lParam, KBDLLHOOKSTRUCT);
}
export function registerKeyboardHookCallback(callback) {
    return koffi.register(callback, koffi.pointer(KeyboardHookProc));
}
export function unregisterCallback(cb) {
    koffi.unregister(cb);
}
