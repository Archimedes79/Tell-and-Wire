/** A map that keeps the *limit* most recently used entries: reading one counts as using it. */
export class Lru<V> {
  private readonly entries = new Map<string, V>();

  private readonly limit: number;

  constructor(limit: number) {
    this.limit = limit;
  }

  get(key: string): V | undefined {
    const found = this.entries.get(key);
    if (found !== undefined) {
      // Most recently used goes last, so the oldest is the one dropped.
      this.entries.delete(key);
      this.entries.set(key, found);
    }
    return found;
  }

  set(key: string, value: V): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    if (this.entries.size > this.limit) this.entries.delete(this.entries.keys().next().value!);
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  [Symbol.iterator](): IterableIterator<[string, V]> {
    return this.entries.entries();
  }
}
