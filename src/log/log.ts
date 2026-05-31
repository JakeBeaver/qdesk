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
