export function useServerFn<T extends (...args: Array<never>) => unknown>(fn: T): T {
  return fn;
}
