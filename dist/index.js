#!/usr/bin/env node
import process from "node:process";
import { startListening } from "./chord-utils.js";
import { setScreenHue } from "./screen-hue.js";
import { activateWindowByHandle, getActiveWindowHandleAndName, } from "./window-utils.js";
// Configure this chord at the top of file.
const DEFAULT_DROP_CHORD = "ctrl+alt+r";
const DEFAULT_REMOVE_CHORD = "ctrl+alt+d";
function normalizeChordInput(chord) {
    return chord.trim().toLowerCase();
}
function getCliArgValue(flag) {
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
const ADD_CHORD = normalizeChordInput(getCliArgValue("-a") ?? DEFAULT_DROP_CHORD);
const DROP_CHORD = normalizeChordInput(getCliArgValue("-d") ?? DEFAULT_REMOVE_CHORD);
if (ADD_CHORD === DROP_CHORD) {
    console.warn(`[warn] add and drop chords are identical (${ADD_CHORD}); behavior may conflict.`);
}
const bindings = new Map();
let activeRecording;
let awaitingChordRemoval = false;
const toolWindowAtStartup = getActiveWindowHandleAndName() ?? undefined;
console.log("[info] Tool window at startup:", toolWindowAtStartup?.name ?? "(unknown)");
let removalReturnWindow;
const listener = startListening({
    onChord: (chord, stopPropagating) => {
        if (activeRecording) {
            if ([ADD_CHORD, DROP_CHORD].includes(chord)) {
                console.warn(`[warn] Ignoring ${chord} chord during active recording to avoid conflicts.`);
                return stopPropagating();
            }
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
            }
            else {
                console.log(`[remove] No binding exists for ${chord}`);
            }
            printBindings();
            return stopPropagating();
        }
        if (chord === ADD_CHORD) {
            awaitingChordRemoval = false;
            setScreenHue("off");
            activeRecording = getActiveWindowHandleAndName();
            if (!activeRecording) {
                console.warn("[warn] No foreground window found to bind.");
            }
            else {
                console.log(`[recording] Armed for "${activeRecording.name}". Waiting for next chord...`);
                setScreenHue("record");
            }
            return stopPropagating();
        }
        if (chord === DROP_CHORD) {
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
                console.error(`[binding ${chord}] Window "${binding.name}" no longer exists, clearing binding.`);
                bindings.delete(chord);
            }
            else if (result === "activated") {
                console.log(`[binding ${chord}] Switched to "${binding.name}"`);
            }
            else {
                console.warn(`[binding ${chord}] Activation failed for "${binding.name}"`);
            }
            return stopPropagating();
        }
    },
});
function printBindings() {
    console.log("\n[winswitcher] Current bindings:");
    if (bindings.size === 0) {
        console.log("  (none)");
    }
    else {
        for (const [chord, window] of bindings) {
            console.log(`  ${chord} -> "${window.name}"`);
        }
    }
    console.log("");
}
console.log("[winswitcher] Starting...");
console.log(`  Adding a chord: ${ADD_CHORD}`);
console.log(`  Dropping a chord: ${DROP_CHORD}`);
console.log("  CLI overrides: -a <combo>, -d <combo>");
listener.runMessageLoop();
