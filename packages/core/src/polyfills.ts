/**
 * Browser polyfills that must run before any Firebase AI Logic call.
 *
 * AbortSignal.any: @firebase/ai 3.1.0 calls it on every cloud request to combine its timeout
 * with the caller's signal. Safari added it only in 17.4, so on older iPhones every cloud call
 * threw "AbortSignal.any is not a function" before leaving the device.
 */
export function abortSignalAny(signals: Iterable<AbortSignal>): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener('abort', () => controller.abort(signal.reason), { once: true });
  }
  return controller.signal;
}

export function installPolyfills(): void {
  const ctor = globalThis.AbortSignal as (typeof AbortSignal & { any?: unknown }) | undefined;
  if (ctor && typeof ctor.any !== 'function') {
    Object.defineProperty(ctor, 'any', {
      value: abortSignalAny,
      configurable: true,
      writable: true,
    });
  }
}

installPolyfills();
