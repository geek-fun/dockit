import { ref, createApp, h } from 'vue';
import { LoadingBar } from '@/components/ui/loading-bar';

// Loading bar animation timing
const PROGRESS_INTERVAL = 50;
const FINISH_DELAY = 300;
const ERROR_DELAY = 500;

interface LoadingBarReturn {
  start: () => void;
  finish: () => void;
  error: () => void;
}

// Singleton instance for the loading bar
let loadingBarApp: ReturnType<typeof createApp> | null = null;
let loadingBarContainer: HTMLElement | null = null;
let progressValue = ref(0);
let isVisible = ref(false);
let isError = ref(false);
let intervalId: ReturnType<typeof setInterval> | null = null;

function getLoadingBarContainer(): HTMLElement {
  if (!loadingBarContainer) {
    loadingBarContainer = document.createElement('div');
    document.body.appendChild(loadingBarContainer);
  }
  return loadingBarContainer;
}

function mountLoadingBar() {
  if (loadingBarApp) return;

  const container = getLoadingBarContainer();

  loadingBarApp = createApp({
    setup() {
      return () =>
        h(LoadingBar, {
          progress: progressValue.value,
          isError: isError.value,
          visible: isVisible.value,
        });
    },
  });

  loadingBarApp.mount(container);
}

function clearIntervalSafe() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}

export function useLoadingBarService(): LoadingBarReturn {
  const start = () => {
    mountLoadingBar();
    clearIntervalSafe();

    isError.value = false;
    progressValue.value = 0;
    isVisible.value = true;

    // Animate progress to simulate loading
    intervalId = setInterval(() => {
      if (progressValue.value < 90) {
        // Slow down as it approaches 90%
        const increment = Math.max(1, (90 - progressValue.value) / 10);
        progressValue.value = Math.min(90, progressValue.value + increment);
      }
    }, PROGRESS_INTERVAL);
  };

  const finish = () => {
    clearIntervalSafe();
    progressValue.value = 100;

    setTimeout(() => {
      isVisible.value = false;
      progressValue.value = 0;
    }, FINISH_DELAY);
  };

  const error = () => {
    clearIntervalSafe();
    isError.value = true;
    progressValue.value = 100;

    setTimeout(() => {
      isVisible.value = false;
      progressValue.value = 0;
      isError.value = false;
    }, ERROR_DELAY);
  };

  return {
    start,
    finish,
    error,
  };
}
