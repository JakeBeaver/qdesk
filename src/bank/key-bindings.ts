import { WindowInfo } from "../koffi/window-utils.js";

export class KeyBindings {
  private bindings = new Map<string, WindowInfo>();

  get(chord: string): WindowInfo | undefined {
    return this.bindings.get(chord);
  }

  set(chord: string, info: WindowInfo): void {
    this.bindings.set(chord, info);
  }

  delete(chord: string): boolean {
    return this.bindings.delete(chord);
  }

  get size(): number {
    return this.bindings.size;
  }

  entries(): IterableIterator<[string, WindowInfo]> {
    return this.bindings.entries();
  }
}
