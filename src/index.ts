#!/usr/bin/env node

import { readFileSync } from "node:fs";
import process from "node:process";
import { normalizeChord, startListening } from "./chord-utils.js";
import { setScreenHue } from "./screen-hue.js";
import {
  activateWindowByHandle,
  getActiveWindowHandleAndName,
  WindowInfo,
} from "./window-utils.js";

// Configure this chord at the top of file.
const DEFAULT_ADD_CHORD = "win+ctrl+a";
const DEFAULT_DROP_CHORD = "win+ctrl+d";

function hasCliFlag(flag: string): boolean {
  return process.argv.slice(2).includes(flag);
}

function getPackageVersion(): string {
  try {
    const packageJson = readFileSync(
      new URL("../package.json", import.meta.url),
      "utf8",
    );
    const parsed = JSON.parse(packageJson) as { version?: string };
    return parsed.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

function setTerminalTitle(title: string): void {
  process.title = title;
  if (process.stdout.isTTY) {
    process.stdout.write(`\u001b]0;${title}\u0007`);
  }
}

if (hasCliFlag("--version") || hasCliFlag("-v")) {
  console.log(getPackageVersion());
  process.exit(0);
}

setTerminalTitle("qdesk");

function normalizeChordInput(chord: string): string {
  return normalizeChord(chord.trim().toLowerCase());
}

function getCliArgValue(flag: string): string | undefined {
  const args = process.argv.slice(2);
  const exact = args.find((arg) => arg.startsWith(`${flag}=`));
  if (exact) {
    return exact.slice(flag.length + 1);
  }

  const idx = args.indexOf(flag);
  if (idx >= 0 && idx + 1 < args.length) {
    return args[idx + 1];
  }

  return undefined;
}

const ADD_CHORD = normalizeChordInput(
  getCliArgValue("-a") ?? DEFAULT_ADD_CHORD,
);
const DROP_CHORD = normalizeChordInput(
  getCliArgValue("-d") ?? DEFAULT_DROP_CHORD,
);

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

const listener = startListening({
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
listener.runMessageLoop();
