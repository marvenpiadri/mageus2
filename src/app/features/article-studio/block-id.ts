let fallbackCounter = 0;

/**
 * Create a stable identifier for one Studio block or nested interactive item.
 * randomUUID is preferred; the fallback remains collision-resistant within a
 * runtime even in browsers without randomUUID support.
 */
export function createStudioItemId(prefix = 'block'): string {
  const cryptoApi = globalThis.crypto;
  if (typeof cryptoApi?.randomUUID === 'function') {
    return `${prefix}-${cryptoApi.randomUUID()}`;
  }

  fallbackCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${fallbackCounter.toString(36)}`;
}
