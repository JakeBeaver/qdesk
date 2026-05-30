import process from "node:process";
import { startListening } from "./chord-utils.js";
import {
  activateWindowByHandle,
  getActiveWindowHandleAndName,
  WindowInfo,
} from "./window-utils.js";

// Configure this chord at the top of file.
const RECORD_CHORD = "ctrl+alt+r";

const bindings = new Map<string, WindowInfo>();

let activeRecording: WindowInfo | undefined;

const listener = startListening({
  onChord: (chord, stopPropagating) => {
    if (activeRecording) {
      bindings.set(chord, activeRecording);
      console.log(`[recording] Bound ${chord} -> "${activeRecording.name}"`);
      activeRecording = undefined;
      printBindings();
      return stopPropagating();
    }

    if (chord === RECORD_CHORD) {
      activeRecording = getActiveWindowHandleAndName();
      if (!activeRecording) {
        console.warn("[warn] No foreground window found to bind.");
      } else {
        console.log(
          `[recording] Armed for "${activeRecording.name}". Waiting for next chord...`,
        );
      }
      return stopPropagating();
    }

    const binding = bindings.get(chord);
    if (binding) {
      const result = activateWindowByHandle(binding.handle);
      if (result === "missing") {
        console.error(
          `[binding ${chord}] Window "${binding.name}" no longer exists, clearing binding.`,
        );
        bindings.delete(chord);
      } else if (result === "activated") {
        console.log(`[binding ${chord}] Switched to "${binding.name}"`);
      } else {
        console.warn(
          `[binding ${chord}] Activation failed for "${binding.name}"`,
        );
      }
      return stopPropagating();
    }
  },
});

function printBindings(): void {
  console.log("\n[winswitcher] Current bindings:");
  if (bindings.size === 0) {
    console.log("  (none)");
  } else {
    for (const [chord, window] of bindings) {
      console.log(`  ${chord} -> "${window.name}"`);
    }
  }
  console.log("");
}

console.log("[winswitcher] Starting...");
console.log(`  record chord: ${RECORD_CHORD}`);
console.log("  press record chord, then next chord binds the active window");

printBindings();
listener.runMessageLoop();
