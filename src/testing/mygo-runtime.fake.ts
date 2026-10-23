// Browser-side Channel stand-in for Vitest and Playwright fake mode.
export class Channel<T> implements AsyncIterable<T> {
  onmessage: ((value: T) => void) | null;
  onclose: (() => void) | null = null;
  closed = false;

  constructor(onmessage?: (value: T) => void) {
    this.onmessage = onmessage ?? null;
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.onclose?.();
  }

  async *[Symbol.asyncIterator](): AsyncIterator<T> {}
}
