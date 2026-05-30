import { startListening } from "./chord-utils.js";
import { setScreenHue } from "./screen-hue.js";
import {
  activateWindowByHandle,
  getActiveWindowHandleAndName,
  WindowInfo,
} from "./window-utils.js";

// Configure this chord at the top of file.
const RECORD_CHORD = "ctrl+alt+r";
const REMOVE_CHORD = "ctrl+alt+d";

const bindings = new Map<string, WindowInfo>();

let activeRecording: WindowInfo | undefined;
let awaitingChordRemoval = false;
const toolWindowAtStartup = getActiveWindowHandleAndName() ?? undefined;
console.log("[info] Tool window at startup:", toolWindowAtStartup);
let removalReturnWindow: WindowInfo | undefined;

const listener = startListening({
  onChord: (chord, stopPropagating) => {
    if (activeRecording) {
      bindings.set(chord, activeRecording);
      console.log(`[recording] Bound ${chord} -> "${activeRecording.name}"`);
      activeRecording = undefined;
      setScreenHue("off");
      printBindings();
      return stopPropagating();
    }

    if (awaitingChordRemoval) {
      awaitingChordRemoval = false;
      setScreenHue("off");
      if (bindings.delete(chord)) {
        console.log(`[remove] Removed binding for ${chord}`);
      } else {
        console.log(`[remove] No binding exists for ${chord}`);
      }
      printBindings();
      return stopPropagating();
    }

    if (chord === RECORD_CHORD) {
      awaitingChordRemoval = false;
      setScreenHue("off");
      activeRecording = getActiveWindowHandleAndName();
      if (!activeRecording) {
        console.warn("[warn] No foreground window found to bind.");
      } else {
        console.log(
          `[recording] Armed for "${activeRecording.name}". Waiting for next chord...`,
        );
        setScreenHue("record");
      }
      return stopPropagating();
    }

    if (chord === REMOVE_CHORD) {
      if (activeRecording) {
        activeRecording = undefined;
        setScreenHue("off");
      }

      awaitingChordRemoval = true;
      if (toolWindowAtStartup) {
        activateWindowByHandle(toolWindowAtStartup.handle);
      }

      console.log("[remove] Armed. Press the chord you want to remove.");
      printBindings();
      setScreenHue("remove");
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
console.log(`  remove chord: ${REMOVE_CHORD}`);
listener.runMessageLoop();
