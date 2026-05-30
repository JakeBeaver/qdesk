import koffi from "koffi";
import { HWND } from "./koffi-utils.js";

const HDC = koffi.pointer("HDC", koffi.opaque());

const user32 = koffi.load("user32.dll");
const gdi32 = koffi.load("gdi32.dll");

let magnification: ReturnType<typeof koffi.load> | null = null;
try {
  magnification = koffi.load("Magnification.dll");
} catch {
  magnification = null;
}

const GetDC = user32.func("GetDC", HDC, [HWND]);
const ReleaseDC = user32.func("ReleaseDC", "int", [HWND, HDC]);
const SetDeviceGammaRamp = gdi32.func("SetDeviceGammaRamp", "int", [
  HDC,
  "void *",
]);

const MagInitialize = magnification
  ? magnification.func("MagInitialize", "int", [])
  : null;
const MagSetFullscreenColorEffect = magnification
  ? magnification.func("MagSetFullscreenColorEffect", "int", ["void *"])
  : null;

let hasWarnedGammaFailure = false;
let hasWarnedMagFailure = false;
let magInitialized = false;
let activeHueBackend: "none" | "gamma" | "magnifier" = "none";

export type ScreenHueMode = "off" | "record" | "remove";

function clampScale(value: number): number {
  return Math.max(0.0, Math.min(1.0, value));
}

function buildGammaRamp(
  redScale: number,
  greenScale: number,
  blueScale: number,
): Buffer {
  // 3 channels * 256 entries * 2 bytes per uint16
  const ramp = Buffer.alloc(3 * 256 * 2);

  const red = clampScale(redScale);
  const green = clampScale(greenScale);
  const blue = clampScale(blueScale);

  for (let i = 0; i < 256; i++) {
    const base = i * 257; // map 0..255 to 0..65535

    const redValue = Math.max(0, Math.min(65535, Math.round(base * red)));
    const greenValue = Math.max(0, Math.min(65535, Math.round(base * green)));
    const blueValue = Math.max(0, Math.min(65535, Math.round(base * blue)));

    ramp.writeUInt16LE(redValue, i * 2);
    ramp.writeUInt16LE(greenValue, (256 + i) * 2);
    ramp.writeUInt16LE(blueValue, (512 + i) * 2);
  }

  return ramp;
}

function buildColorEffectMatrix(mode: ScreenHueMode): Buffer {
  // MAGCOLOREFFECT is a 5x5 float matrix.
  const matrix = Buffer.alloc(25 * 4);

  const redScale = mode === "record" ? 1.0 : mode === "remove" ? 0.35 : 1.0;
  const greenScale = mode === "record" ? 0.3 : mode === "remove" ? 1.0 : 1.0;
  const blueScale = mode === "record" ? 0.18 : mode === "remove" ? 0.35 : 1.0;

  const values = [
    redScale,
    0,
    0,
    0,
    0,
    0,
    greenScale,
    0,
    0,
    0,
    0,
    0,
    blueScale,
    0,
    0,
    0,
    0,
    0,
    1,
    0,
    0,
    0,
    0,
    0,
    1,
  ];

  for (let i = 0; i < values.length; i++) {
    matrix.writeFloatLE(values[i], i * 4);
  }

  return matrix;
}

function tryApplyMagnifierHue(mode: ScreenHueMode): boolean {
  if (!MagInitialize || !MagSetFullscreenColorEffect) {
    return false;
  }

  if (!magInitialized) {
    const initOk = Number(MagInitialize());
    if (!initOk) {
      return false;
    }
    magInitialized = true;
  }

  const matrix = buildColorEffectMatrix(mode);
  const ok = Number(MagSetFullscreenColorEffect(matrix));
  return ok !== 0;
}

export function setScreenHue(mode: ScreenHueMode): void {
  const screenDc = GetDC(null);
  if (!screenDc) {
    return;
  }

  try {
    if (mode !== "off") {
      // Try requested tint first, then a milder fallback accepted by more drivers.
      const primaryRamp =
        mode === "record"
          ? buildGammaRamp(1.0, 0.22, 0.35)
          : buildGammaRamp(0.4, 1.0, 0.4);
      let ok = Number(SetDeviceGammaRamp(screenDc, primaryRamp));

      if (!ok) {
        const fallbackRamp =
          mode === "record"
            ? buildGammaRamp(1.0, 0.58, 0.35)
            : buildGammaRamp(0.65, 1.0, 0.65);
        ok = Number(SetDeviceGammaRamp(screenDc, fallbackRamp));
      }

      if (ok) {
        activeHueBackend = "gamma";
        return;
      }

      if (!hasWarnedGammaFailure) {
        hasWarnedGammaFailure = true;
        console.warn(
          "[warn] Gamma ramp unsupported on this display/driver, trying Magnification fallback.",
        );
      }

      if (tryApplyMagnifierHue(mode)) {
        activeHueBackend = "magnifier";
        return;
      }

      activeHueBackend = "none";
      if (!hasWarnedMagFailure) {
        hasWarnedMagFailure = true;
        console.warn("[warn] Screen hue could not be applied on this system.");
      }
      return;
    }

    // Turning hue off: clear whichever backend might have been used.
    let cleared = false;

    if (activeHueBackend === "magnifier") {
      cleared = tryApplyMagnifierHue("off");
    }

    const neutralRamp = buildGammaRamp(1.0, 1.0, 1.0);
    const gammaCleared =
      Number(SetDeviceGammaRamp(screenDc, neutralRamp)) !== 0;
    cleared = cleared || gammaCleared;

    if (activeHueBackend !== "magnifier") {
      // Safe no-op when magnifier was never used; necessary when it was.
      cleared = tryApplyMagnifierHue("off") || cleared;
    }

    if (cleared) {
      activeHueBackend = "none";
    } else if (!hasWarnedMagFailure) {
      hasWarnedMagFailure = true;
      console.warn("[warn] Screen hue could not be reset on this system.");
    }
  } finally {
    ReleaseDC(null, screenDc);
  }
}
