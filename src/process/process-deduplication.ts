import koffi from "koffi";
import fs from "fs";
import os from "os";
import path from "path";
import { getProcessCreationTime } from "./get-process-creation-time.js";

const LOCK_FILE = path.join(os.tmpdir(), "qdesk.lock");

type ProcessLockinfo = {
  pid: number;
  creationTime: string;
};

export function isAlreadyRunning() {
  try {
    const lockInfo: ProcessLockinfo = JSON.parse(
      fs.readFileSync(LOCK_FILE, "utf8").trim(),
    );
    process.kill(lockInfo.pid, 0);
    return getProcessCreationTime(lockInfo.pid) === lockInfo.creationTime;
  } catch {
    // stale lock, fall through
  }
  fs.writeFileSync(
    LOCK_FILE,
    JSON.stringify({
      pid: process.pid,
      creationTime: getProcessCreationTime(process.pid),
    }),
  );
  return false;
}

export function ensureSingleProcess() {
  if (isAlreadyRunning()) {
    console.error("Another instance is already running. Exiting.");
    process.exit(1);
  }
}
