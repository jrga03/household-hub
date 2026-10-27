/**
 * Median milliseconds of `run` after warm-up calls. One cold sample measures JIT,
 * garbage collection and CPU shared with parallel test files, not the code.
 */
export function medianMs(run: () => unknown, { warmups = 3, samples = 5 } = {}): number {
  for (let index = 0; index < warmups; index++) run();
  const times = Array.from({ length: samples }, () => {
    const started = performance.now();
    run();
    return performance.now() - started;
  }).sort((a, b) => a - b);
  return times[Math.floor(samples / 2)] ?? Number.POSITIVE_INFINITY;
}
