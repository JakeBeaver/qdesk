import koffi from "koffi";
import { kernel32 } from "../koffi/koffi-utils.js";

const HANDLE = koffi.pointer("HANDLE", koffi.opaque());

const OpenProcess = kernel32.func("OpenProcess", HANDLE, [
  "uint32",
  "int",
  "uint32",
]);
const GetProcessTimes = kernel32.func("GetProcessTimes", "int", [
  HANDLE,
  "void *",
  "void *",
  "void *",
  "void *",
]);
const CloseHandle = kernel32.func("CloseHandle", "int", [HANDLE]);

const PROCESS_QUERY_LIMITED_INFORMATION = 0x1000;

function readFileTime(buffer: Buffer): string {
  const low = BigInt(buffer.readUInt32LE(0));
  const high = BigInt(buffer.readUInt32LE(4));
  return ((high << 32n) | low).toString();
}

export function getProcessCreationTime(pid: number): string | null {
  if (!Number.isInteger(pid) || pid <= 0) {
    return null;
  }

  const processHandle = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, 0, pid);
  if (!processHandle) {
    return null;
  }

  const creationTime = Buffer.alloc(8);
  const exitTime = Buffer.alloc(8);
  const kernelTime = Buffer.alloc(8);
  const userTime = Buffer.alloc(8);

  try {
    const ok = Number(
      GetProcessTimes(
        processHandle,
        creationTime,
        exitTime,
        kernelTime,
        userTime,
      ),
    );
    if (!ok) {
      return null;
    }

    return readFileTime(creationTime);
  } finally {
    CloseHandle(processHandle);
  }
}
