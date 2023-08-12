import { ref } from 'vue';

// Throttle
export function useThrottle(fn: () => void, delay: number = 500): () => void {
  const throttled = ref(false);
  return function throttledFn() {
    if (!throttled.value) {
      fn();
      throttled.value = true;
      setTimeout(() => {
        throttled.value = false;
      }, delay);
    }
  };
}

// Debounce
export function useDebounce(fn: () => void, delay: number = 500): () => void {
  let timer: NodeJS.Timeout;
  return function debouncedFn() {
    clearTimeout(timer);
    timer = setTimeout(fn, delay);
  };
}
