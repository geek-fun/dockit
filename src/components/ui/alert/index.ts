import { cva, type VariantProps } from 'class-variance-authority';

export { default as Alert } from './Alert.vue';
export { default as AlertTitle } from './AlertTitle.vue';
export { default as AlertDescription } from './AlertDescription.vue';

export const alertVariants = cva(
  'relative w-full rounded-lg p-4 [&>svg~*]:pl-7 [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground',
  {
    variants: {
      variant: {
        default: 'bg-muted/50 text-foreground',
        destructive:
          'bg-destructive/10 text-destructive dark:bg-destructive/15 [&>svg]:text-destructive',
        success:
          'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400 [&>svg]:text-green-600 dark:[&>svg]:text-green-400',
        warning:
          'bg-yellow-50 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400 [&>svg]:text-yellow-600 dark:[&>svg]:text-yellow-400',
        info: 'bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-400 [&>svg]:text-blue-600 dark:[&>svg]:text-blue-400',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export type AlertVariants = VariantProps<typeof alertVariants>;
