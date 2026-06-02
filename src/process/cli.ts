import { readFileSync } from "fs";
import { normalizeChord } from "../koffi/chord-utils.js";

const DEFAULT_ADD_CHORD = "win+ctrl+a";
const DEFAULT_DROP_CHORD = "win+ctrl+d";

export function getCliArgStuff() {
  if (hasCliFlag("--version") || hasCliFlag("-v")) {
    console.log(getPackageVersion());
    process.exit(0);
  }

  setTerminalTitle("qdesk");

  const ADD_CHORD = normalizeChord(getCliArgValue("-a") ?? DEFAULT_ADD_CHORD);
  const DROP_CHORD = normalizeChord(getCliArgValue("-d") ?? DEFAULT_DROP_CHORD);
  return { ADD_CHORD, DROP_CHORD };
}

function hasCliFlag(flag: string): boolean {
  return process.argv.slice(2).includes(flag);
}

function getPackageVersion(): string {
  try {
    const packageJson = readFileSync(
      new URL("../../package.json", import.meta.url),
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
