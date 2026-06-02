#!/usr/bin/env node

import { startListening } from "./koffi/chord-listener.js";
import { setScreenHue } from "./koffi/screen-hue.js";
import {
  activateWindowByHandle,
  checkIfWindowExists,
  getActiveWindowHandleAndName,
  WindowInfo,
} from "./koffi/window-utils.js";
import { ensureSingleProcess } from "./process/process-deduplication.js";
import { getCliArgStuff } from "./process/cli.js";
import { KeyBindings } from "./bank/key-bindings.js";
import { logInfo, logSwitch, logWarn } from "./log/log.js";

ensureSingleProcess();

const { ADD_CHORD, DROP_CHORD } = getCliArgStuff();
if (ADD_CHORD === DROP_CHORD) {
  logWarn(
    `add and drop chords are identical (${ADD_CHORD}); behavior may conflict.`,
  );
}

let activeRecording: WindowInfo | undefined;
let awaitingChordRemoval = false;
const toolWindowAtStartup = getActiveWindowHandleAndName() ?? undefined;
logInfo(`Tool window at startup: ${toolWindowAtStartup?.name ?? "(unknown)"}`);

const bindings = new KeyBindings();

startListening({
  onEscape: (stopPropagating) => {
    if (!activeRecording && !awaitingChordRemoval) {
      return;
    }

    if (activeRecording) {
      logInfo("Canceled recording mode via Escape.");
      activeRecording = undefined;
    }

    if (awaitingChordRemoval) {
      logInfo("Canceled removal mode via Escape.");
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
        logWarn(
          `Ignoring ${chord} chord during active recording to avoid conflicts.`,
        );
        return stopPropagating();
      }
      bindings.set(chord, activeRecording);
      activeRecording = undefined;
      setScreenHue("off");
      printBindings();
      return stopPropagating();
    }

    // removing
    if (awaitingChordRemoval) {
      awaitingChordRemoval = false;
      setScreenHue("off");
      bindings.delete(chord);
      printBindings();
      return stopPropagating();
    }

    // trigger recording
    if (chord === ADD_CHORD) {
      awaitingChordRemoval = false;
      setScreenHue("off");
      activeRecording = getActiveWindowHandleAndName();
      if (!activeRecording) {
        logWarn("No foreground window found to bind.");
      } else {
        logInfo(
          `Armed for "${activeRecording.name}". Waiting for next chord... (Esc to cancel)`,
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

      logInfo(
        "Armed for removal. Press the chord you want to remove. (Esc to cancel)",
      );
      printBindings();
      setScreenHue("remove");
      return stopPropagating();
    }

    // switching
    const binding = bindings.get(chord);
    if (binding) {
      const result = activateWindowByHandle(binding.handle);
      if (result === "missing") {
        logSwitch({
          chord,
          name: binding.name,
          type: "missing",
        });
        bindings.reportMissing(chord);
        setScreenHue("remove");
        setTimeout(() => {
          setScreenHue("off");
        }, 50);
      } else if (result === "activated") {
        logSwitch({
          chord,
          name: binding.name,
          type: "success",
        });
      } else {
        logSwitch({
          chord,
          name: binding.name,
          type: "failed",
        });
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
    for (const [chord, window] of bindings.entries()) {
      console.log(`  ${chord} -> "${window.name}"`);
    }
  }
  console.log("");
}

console.log("[qdesk] Starting...");
console.log(`  Adding a chord: ${ADD_CHORD}`);
console.log(`  Dropping a chord: ${DROP_CHORD}`);
console.log("  CLI overrides: -a <combo>, -d <combo>");

for (const [chord, window] of bindings.entries()) {
  if (!checkIfWindowExists(window.handle)) {
    bindings.reportMissing(chord);
  }
}

if (bindings.size > 0) {
  printBindings();
}
