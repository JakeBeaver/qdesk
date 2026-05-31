#!/usr/bin/env node

import { startListening } from "./koffi/chord-listener.js";
import { setScreenHue } from "./koffi/screen-hue.js";
import {
  activateWindowByHandle,
  getActiveWindowHandleAndName,
  WindowInfo,
} from "./koffi/window-utils.js";
import { ensureSingleProcess } from "./process/process-utils.js";
import { getCliArgStuff } from "./process/cli.js";

ensureSingleProcess();

const { ADD_CHORD, DROP_CHORD } = getCliArgStuff();
if (ADD_CHORD === DROP_CHORD) {
  console.warn(
    `[warn] add and drop chords are identical (${ADD_CHORD}); behavior may conflict.`,
  );
}

const bindings = new Map<string, WindowInfo>();

let activeRecording: WindowInfo | undefined;
let awaitingChordRemoval = false;
const toolWindowAtStartup = getActiveWindowHandleAndName() ?? undefined;
console.log(
  "[info] Tool window at startup:",
  toolWindowAtStartup?.name ?? "(unknown)",
);

startListening({
  onEscape: (stopPropagating) => {
    if (!activeRecording && !awaitingChordRemoval) {
      return;
    }

    if (activeRecording) {
      console.log("[add] Canceled recording mode via Escape.");
      activeRecording = undefined;
    }

    if (awaitingChordRemoval) {
      console.log("[drop] Canceled removal mode via Escape.");
      awaitingChordRemoval = false;
    }

    setScreenHue("off");
    printBindings();
    stopPropagating();
  },
  onChord: (chord, stopPropagating) => {
    // recording
    if (activeRecording) {
      if ([ADD_CHORD, DROP_CHORD].includes(chord)) {
        console.warn(
          `[warn] Ignoring ${chord} chord during active recording to avoid conflicts.`,
        );
        return stopPropagating();
      }
      bindings.set(chord, activeRecording);
      console.log(`[add] Bound ${chord} -> "${activeRecording.name}"`);
      activeRecording = undefined;
      setScreenHue("off");
      printBindings();
      return stopPropagating();
    }

    // removing
    if (awaitingChordRemoval) {
      awaitingChordRemoval = false;
      setScreenHue("off");
      if (bindings.delete(chord)) {
        console.log(`[drop] Removed binding for ${chord}`);
      } else {
        console.log(`[drop] No binding exists for ${chord}`);
      }
      printBindings();
      return stopPropagating();
    }

    // trigger recording
    if (chord === ADD_CHORD) {
      awaitingChordRemoval = false;
      setScreenHue("off");
      activeRecording = getActiveWindowHandleAndName();
      if (!activeRecording) {
        console.warn("[warn] No foreground window found to bind.");
      } else {
        console.log(
          `[add] Armed for "${activeRecording.name}". Waiting for next chord...`,
        );
        setScreenHue("record");
      }
      return stopPropagating();
    }

    // trigger removing
    if (chord === DROP_CHORD) {
      if (activeRecording) {
        activeRecording = undefined;
        setScreenHue("off");
      }

      awaitingChordRemoval = true;
      if (toolWindowAtStartup) {
        activateWindowByHandle(toolWindowAtStartup.handle);
      }

      console.log("[drop] Armed. Press the chord you want to remove.");
      printBindings();
      setScreenHue("remove");
      return stopPropagating();
    }

    // switching
    const binding = bindings.get(chord);
    if (binding) {
      const result = activateWindowByHandle(binding.handle);
      if (result === "missing") {
        console.error(
          `[switch ${chord}] Window "${binding.name}" no longer exists, clearing binding.`,
        );
        bindings.delete(chord);
      } else if (result === "activated") {
        console.log(`[switch ${chord}] Switched to "${binding.name}"`);
      } else {
        console.warn(
          `[switch ${chord}] Activation failed for "${binding.name}"`,
        );
      }
      return stopPropagating();
    }
  },
});

function printBindings(): void {
  console.log("\n[qdesk] Current bindings:");
  if (bindings.size === 0) {
    console.log("  (none)");
  } else {
    for (const [chord, window] of bindings) {
      console.log(`  ${chord} -> "${window.name}"`);
    }
  }
  console.log("");
}

console.log("[qdesk] Starting...");
console.log(`  Adding a chord: ${ADD_CHORD}`);
console.log(`  Dropping a chord: ${DROP_CHORD}`);
console.log("  CLI overrides: -a <combo>, -d <combo>");
