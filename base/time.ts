export const MAX_TS = 9007199254740991;
/**
 * This file is home to time related utils. Delays, retry logic, timing
 * functions, etc. all belong in here.
 */

/**
 * Executes a given function after the specified delay, similar to
 * setTimeout().
 *
 * @param delayMs The time to wait in milliseconds.
 * @param func The function to execute after the delay.
 *
 * @returns A promise holding the function's result.
 */
export function delay<T>(delayMs: number, func: () => T): Promise<T> {
  if (delayMs <= 0) {
    let reject: (err: any) => void, resolve: (v: T) => void;
    const promise = new Promise<T>((res, rej) => {
      reject = rej;
      resolve = res;
    });
    queueMicrotask(() => {
      try {
        resolve(func());
      } catch (e) {
        reject(e);
      }
    });
    return promise;
  }
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        resolve(func());
      } catch (e) {
        reject(e);
      }
    }, delayMs);
  });
}

export class RetryBaseErr extends Error {
  constructor(readonly origError?: unknown) {
    super(origError instanceof Error ? origError.message : 'Unknown Error');
  }
}

export class TryAgain extends RetryBaseErr {}

export class NoRetry extends RetryBaseErr {}

/**
 * Retry a given function and return its results.
 *
 * @param func The function to retry.
 * @param timeoutMs The timeout duration in milliseconds after which to give up.
 * @param maxDelayMs Maximum delay in milliseconds between retries.
 * @param timingFunc A timing function that spreads the retry attempts within
 *                   the given timeout duration.
 *
 * @returns The result of `func`.
 */
export async function retry<T>(
  func: () => T | Promise<T>,
  timeoutMs: number,
  maxDelayMs = 20,
  timingFunc: (factor: number) => number = easeInQuad,
): Promise<T> {
  const startTime = Date.now();
  let factor = 0;
  let err: any = null;
  do {
    try {
      return err === null || err instanceof TryAgain
        ? await func()
        : await delay(maxDelayMs * timingFunc(factor), func);
    } catch (e) {
      if (e instanceof NoRetry) {
        throw e.origError;
      }
      err = e;
    }
    factor = (Date.now() - startTime) / timeoutMs;
  } while (factor <= 1 || err instanceof TryAgain);

  // If we got this far then we timed out on an error. Bubble it up.
  throw err instanceof RetryBaseErr ? err.origError : err;
}

export function sleep(durationMs: number): Promise<void> {
  let resolve: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  setTimeout(resolve!, durationMs);
  return promise;
}

export function clip(value: number, min: number = 0, max: number = 1): number {
  return Math.max(min, Math.min(max, value));
}

export function linear(factor: number): number {
  return clip(factor);
}

export function easeInQuad(factor: number): number {
  return Math.pow(clip(factor), 2);
}

export function easeInOutSine(factor: number): number {
  return -(Math.cos(Math.PI * clip(factor)) - 1) / 2;
}

export function easeInOutQuint(x: number): number {
  return x < 0.5 ? 16 * x * x * x * x * x : 1 - Math.pow(-2 * x + 2, 5) / 2;
}

export function easeInExpo(x: number): number {
  return x === 0 ? 0 : Math.pow(2, 10 * x - 10);
}

export function secondsToMS(sec: number) {
  return sec * 1000;
}

export function minutesToMS(min: number) {
  return min * 60 * 1000;
}

export function hoursToMS(hours: number) {
  return hours * 60 * 60 * 1000;
}

export function daysToMS(days: number) {
  return days * 24 * 60 * 60 * 1000;
}

export function toReverseTimestamp(d: number | Date): number {
  if (d instanceof Date) {
    d = d.getTime();
  }
  return MAX_TS - d;
}

export function fromReverseTimestamp(ts: number): Date {
  const d = new Date();
  d.setTime(MAX_TS - ts);
  return d;
}
