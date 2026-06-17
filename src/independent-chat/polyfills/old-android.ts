type MatchAllResult = IterableIterator<RegExpMatchArray>;

function definePolyfill(target: object, name: string, value: unknown): void {
  Object.defineProperty(target, name, {
    configurable: true,
    writable: true,
    value,
  });
}

if (!Array.prototype.flatMap) {
  definePolyfill(Array.prototype, 'flatMap', function flatMap<T, U>(
    this: T[],
    callback: (value: T, index: number, array: T[]) => U | U[],
    thisArg?: unknown,
  ): U[] {
    return Array.prototype.concat.apply([], this.map((value, index, array) =>
      callback.call(thisArg, value, index, array),
    ) as unknown as U[][]);
  });
}

if (!Object.fromEntries) {
  definePolyfill(Object, 'fromEntries', function fromEntries(
    entries: Iterable<[PropertyKey, unknown]>,
  ): Record<PropertyKey, unknown> {
    const result: Record<PropertyKey, unknown> = {};
    for (const entry of entries) {
      if (!entry) continue;
      result[entry[0]] = entry[1];
    }
    return result;
  });
}

function flagsFor(regex: RegExp): string {
  let flags = regex.global ? 'g' : '';
  flags += regex.ignoreCase ? 'i' : '';
  flags += regex.multiline ? 'm' : '';
  flags += (regex as RegExp & { unicode?: boolean }).unicode ? 'u' : '';
  flags += (regex as RegExp & { sticky?: boolean }).sticky ? 'y' : '';
  return flags;
}

if (!String.prototype.matchAll) {
  definePolyfill(String.prototype, 'matchAll', function matchAll(
    this: string,
    pattern: RegExp | string,
  ): MatchAllResult {
    const source = String(this);
    const patternFlags = pattern instanceof RegExp ? flagsFor(pattern) : 'g';
    const regex = pattern instanceof RegExp
      ? new RegExp(pattern.source, patternFlags.includes('g') ? patternFlags : `${patternFlags}g`)
      : new RegExp(String(pattern), 'g');
    const iterator = {
      next(): IteratorResult<RegExpMatchArray> {
        const match = regex.exec(source);
        if (!match) return { done: true, value: undefined as unknown as RegExpMatchArray };
        if (match[0] === '') regex.lastIndex += 1;
        return { done: false, value: match };
      },
      [Symbol.iterator]() {
        return this;
      },
    };
    return iterator as MatchAllResult;
  });
}
