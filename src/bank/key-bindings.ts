import { WindowInfo } from "../koffi/window-utils.js";
import fs from "fs";
import os from "os";
import path from "path";

const STORAGE_FILE = path.join(os.tmpdir(), "qdesk.bindings");

type StoredWindowInfo = {
  handle: string;
  name: string;
};

type StoredBinding = {
  chord: string;
  info: StoredWindowInfo;
};

export class KeyBindings {
  private bindings = new Map<string, WindowInfo>();

  constructor() {
    const loaded = load();
    for (const { chord, info } of loaded) {
      this.bindings.set(chord, info);
    }
  }

  get(chord: string): WindowInfo | undefined {
    return this.bindings.get(chord);
  }

  set(chord: string, info: WindowInfo): void {
    this.bindings.set(chord, info);
    save(this.bindings);
  }

  delete(chord: string): boolean {
    const output = this.bindings.delete(chord);
    save(this.bindings);
    return output;
  }

  get size(): number {
    return this.bindings.size;
  }

  entries(): IterableIterator<[string, WindowInfo]> {
    return this.bindings.entries();
  }
}

function load() {
  try {
    const raw = fs.readFileSync(STORAGE_FILE, "utf8");
    const parsed = JSON.parse(raw) as StoredBinding[];

    return parsed.map(({ chord, info }) => ({
      chord,
      info: {
        handle: BigInt(info.handle),
        name: info.name,
      },
    }));
  } catch {
    return [];
  }
}

function save(bindings: Map<string, WindowInfo>) {
  const data = Array.from(bindings.entries()).map(([chord, info]) => ({
    chord,
    info: {
      handle: info.handle.toString(),
      name: info.name,
    },
  }));
  fs.writeFileSync(STORAGE_FILE, JSON.stringify(data), "utf8");
}
