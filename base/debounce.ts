export function debounce<T extends { (args: K): R }, K = void, R = void>(
  fn: T,
  delay = 0
) {
  let timeoutId: any;
  return (args: K) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(args);
      timeoutId = null;
    }, delay);
  };
}
