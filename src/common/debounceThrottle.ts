import { ref } from 'vue';

export const useThrottle = (fn: () => void, delay = 500): (() => void) => {
  const throttled = ref(false);
  return () => {
    if (!throttled.value) {
      fn();
      throttled.value = true;
      setTimeout(() => {
        throttled.value = false;
      }, delay);
    }
  };
};

export const useDebounce = (fn: () => void, delay = 500): (() => void) => {
  let timer: ReturnType<typeof setTimeout>;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, delay);
  };
};
