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

function clampScale(value: number): number {
  return Math.max(0.0, Math.min(1.0, value));
}

function buildGammaRamp(
  on: boolean,
  greenScaleOn: number,
  blueScaleOn: number,
): Buffer {
  // 3 channels * 256 entries * 2 bytes per uint16
  const ramp = Buffer.alloc(3 * 256 * 2);

  const greenScale = on ? clampScale(greenScaleOn) : 1.0;
  const blueScale = on ? clampScale(blueScaleOn) : 1.0;

  for (let i = 0; i < 256; i++) {
    const base = i * 257; // map 0..255 to 0..65535

    const red = base;
    const green = Math.max(0, Math.min(65535, Math.round(base * greenScale)));
    const blue = Math.max(0, Math.min(65535, Math.round(base * blueScale)));

    ramp.writeUInt16LE(red, i * 2);
    ramp.writeUInt16LE(green, (256 + i) * 2);
    ramp.writeUInt16LE(blue, (512 + i) * 2);
  }

  return ramp;
}

function buildColorEffectMatrix(on: boolean): Buffer {
  // MAGCOLOREFFECT is a 5x5 float matrix.
  const matrix = Buffer.alloc(25 * 4);

  const redScale = 1.0;
  const greenScale = on ? 0.3 : 1.0;
  const blueScale = on ? 0.18 : 1.0;

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

function tryApplyMagnifierHue(on: boolean): boolean {
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

  const matrix = buildColorEffectMatrix(on);
  const ok = Number(MagSetFullscreenColorEffect(matrix));
  return ok !== 0;
}

export function toggleScreenHue(on: boolean): void {
  const screenDc = GetDC(null);
  if (!screenDc) {
    return;
  }

  try {
    if (on) {
      // Try requested strong tint first, then a milder fallback accepted by more drivers.
      const primaryRamp = buildGammaRamp(true, 0.22, 0.35);
      let ok = Number(SetDeviceGammaRamp(screenDc, primaryRamp));

      if (!ok) {
        const fallbackRamp = buildGammaRamp(true, 0.58, 0.35);
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

      if (tryApplyMagnifierHue(true)) {
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
      cleared = tryApplyMagnifierHue(false);
    }

    const neutralRamp = buildGammaRamp(false, 1.0, 1.0);
    const gammaCleared =
      Number(SetDeviceGammaRamp(screenDc, neutralRamp)) !== 0;
    cleared = cleared || gammaCleared;

    if (activeHueBackend !== "magnifier") {
      // Safe no-op when magnifier was never used; necessary when it was.
      cleared = tryApplyMagnifierHue(false) || cleared;
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
