import { ref, createApp, h } from 'vue';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';

// Animation cleanup delay in milliseconds
const DIALOG_CLEANUP_DELAY = 200;

interface DialogOptions {
  title: string;
  content: string;
  positiveText?: string;
  negativeText?: string;
  type?: 'info' | 'warning' | 'error' | 'success';
  onPositiveClick?: () => void | Promise<void>;
  onNegativeClick?: () => void | Promise<void>;
}

interface DialogReturn {
  warning: (options: DialogOptions) => void;
  info: (options: DialogOptions) => void;
  error: (options: DialogOptions) => void;
  success: (options: DialogOptions) => void;
}

export function useDialogService(): DialogReturn {
  const createDialog = (options: DialogOptions) => {
    const container = document.createElement('div');
    document.body.appendChild(container);

    const open = ref(true);

    const handlePositive = async () => {
      if (options.onPositiveClick) {
        await options.onPositiveClick();
      }
      open.value = false;
    };

    const handleNegative = async () => {
      if (options.onNegativeClick) {
        await options.onNegativeClick();
      }
      open.value = false;
    };

    const handleOpenChange = (isOpen: boolean) => {
      open.value = isOpen;
      if (!isOpen) {
        // Cleanup after animation
        setTimeout(() => {
          app.unmount();
          container.remove();
        }, DIALOG_CLEANUP_DELAY);
      }
    };

    const app = createApp({
      setup() {
        return () =>
          h(
            AlertDialog,
            {
              open: open.value,
              'onUpdate:open': handleOpenChange,
            },
            {
              default: () =>
                h(AlertDialogContent, null, {
                  default: () => [
                    h(AlertDialogHeader, null, {
                      default: () => [
                        h(AlertDialogTitle, null, { default: () => options.title }),
                        h(AlertDialogDescription, null, { default: () => options.content }),
                      ],
                    }),
                    h(AlertDialogFooter, null, {
                      default: () => [
                        options.negativeText
                          ? h(
                              AlertDialogCancel,
                              { onClick: handleNegative },
                              { default: () => options.negativeText },
                            )
                          : null,
                        h(
                          AlertDialogAction,
                          { onClick: handlePositive },
                          { default: () => options.positiveText || 'OK' },
                        ),
                      ],
                    }),
                  ],
                }),
            },
          );
      },
    });

    app.mount(container);
  };

  return {
    warning: (options: DialogOptions) => createDialog({ ...options, type: 'warning' }),
    info: (options: DialogOptions) => createDialog({ ...options, type: 'info' }),
    error: (options: DialogOptions) => createDialog({ ...options, type: 'error' }),
    success: (options: DialogOptions) => createDialog({ ...options, type: 'success' }),
  };
}
