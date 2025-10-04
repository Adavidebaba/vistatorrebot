export class LogNotifier {
  constructor() {
    this.listeners = new Set();
  }

  subscribe(listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('LogNotifier listener must be a function');
    }
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  notify(event) {
    if (!event || typeof event !== 'object') {
      return;
    }
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[ERR] [LogNotifier]', 'Listener failed', error);
      }
    }
  }
}

export const logNotifier = new LogNotifier();
