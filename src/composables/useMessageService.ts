import { createApp, h } from 'vue';
import { Toast } from '@/components/ui/toast';

// Default duration for messages in milliseconds
const DEFAULT_DURATION = 3000;

// Animation cleanup delay in milliseconds
const MESSAGE_CLEANUP_DELAY = 300;

interface MessageOptions {
  closable?: boolean;
  keepAliveOnHover?: boolean;
  duration?: number;
}

type MessageType = 'success' | 'error' | 'warning' | 'info';

interface MessageReturn {
  success: (content: string, options?: MessageOptions) => void;
  error: (content: string, options?: MessageOptions) => void;
  warning: (content: string, options?: MessageOptions) => void;
  info: (content: string, options?: MessageOptions) => void;
}

// Container element for toast messages
let toastContainer: HTMLElement | null = null;

function getToastContainer(): HTMLElement {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className =
      'fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none w-full max-w-[420px]';
    document.body.appendChild(toastContainer);
  }
  return toastContainer;
}

export function useMessageService(): MessageReturn {
  const createMessage = (content: string, type: MessageType, options: MessageOptions = {}) => {
    const container = getToastContainer();
    const messageEl = document.createElement('div');
    messageEl.className = 'animate-in slide-in-from-right fade-in duration-200';
    container.appendChild(messageEl);

    const duration = options.duration ?? DEFAULT_DURATION;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let isPaused = false;
    let remainingTime = duration;
    let startTime = Date.now();

    const cleanup = () => {
      messageEl.className = 'animate-out slide-out-to-right fade-out duration-200';
      setTimeout(() => {
        app.unmount();
        messageEl.remove();
      }, MESSAGE_CLEANUP_DELAY);
    };

    const startTimer = () => {
      if (remainingTime > 0 && remainingTime !== Infinity) {
        startTime = Date.now();
        timeoutId = setTimeout(cleanup, remainingTime);
      }
    };

    const pauseTimer = () => {
      if (timeoutId && options.keepAliveOnHover) {
        isPaused = true;
        clearTimeout(timeoutId);
        remainingTime = Math.max(0, remainingTime - (Date.now() - startTime));
      }
    };

    const resumeTimer = () => {
      if (isPaused && options.keepAliveOnHover) {
        isPaused = false;
        startTimer();
      }
    };

    const app = createApp({
      setup() {
        return () =>
          h(
            'div',
            {
              onMouseenter: pauseTimer,
              onMouseleave: resumeTimer,
            },
            [
              h(
                Toast,
                {
                  type,
                  closable: options.closable ?? true,
                  onClose: () => {
                    if (timeoutId) clearTimeout(timeoutId);
                    cleanup();
                  },
                },
                {
                  default: () => content,
                },
              ),
            ],
          );
      },
    });

    app.mount(messageEl);
    startTimer();
  };

  return {
    success: (content: string, options?: MessageOptions) =>
      createMessage(content, 'success', options),
    error: (content: string, options?: MessageOptions) => createMessage(content, 'error', options),
    warning: (content: string, options?: MessageOptions) =>
      createMessage(content, 'warning', options),
    info: (content: string, options?: MessageOptions) => createMessage(content, 'info', options),
  };
}
