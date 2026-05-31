import fs from "fs";
import os from "os";
import path from "path";

const LOCK_FILE = path.join(os.tmpdir(), "qdesk.lock");

export function isAlreadyRunning() {
  if (fs.existsSync(LOCK_FILE)) {
    const pid = parseInt(fs.readFileSync(LOCK_FILE, "utf8").trim());
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      // stale lock, fall through
    }
  }
  fs.writeFileSync(LOCK_FILE, String(process.pid));
  return false;
}

export function ensureSingleProcess() {
  if (isAlreadyRunning()) {
    console.error("Another instance is already running. Exiting.");
    process.exit(1);
  }
}
