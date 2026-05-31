export function logSwitch({
  chord,
  name,
  type,
}: {
  chord: string;
  name: string;
  type: "success" | "failed" | "missing";
}) {
  const status = type === "success" ? "✅" : type === "failed" ? "❌" : "❓";

  console.log(`[switch ${chord}] ${status} "${name}"`);
}

export function logInfo(message: string) {
  console.log(`[info] ${message}`);
}

export function logError(message: string) {
  console.error(`[error] ${message}`);
}

export function logWarn(message: string) {
  console.warn(`[warn] ${message}`);
}
