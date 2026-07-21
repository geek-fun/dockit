import { defineConfig, presetIcons, transformerDirectives, transformerVariantGroup } from 'unocss';
import { presetWind4 } from '@unocss/preset-wind4';
import presetAnimations from 'unocss-preset-animations';
import carbonIcons from '@iconify-json/carbon/icons.json';
import lucideIcons from '@iconify-json/lucide/icons.json';

export default defineConfig({
  presets: [
    presetWind4({
      preflights: {
        reset: true, // Built-in reset styles (replaces @unocss/reset)
        theme: 'on-demand', // Generate theme CSS variables on-demand
        property: true, // Generate @property rules for better optimization
      },
    }),
    presetIcons({
      scale: 1.2,
      warn: true,
      // Explicit collections — auto-discovery can fail in Tauri/Vite production builds
      // which leaves sidebar/action icons invisible while click targets still work.
      collections: {
        carbon: () => carbonIcons,
        lucide: () => lucideIcons,
      },
      extraProperties: {
        display: 'inline-block',
        'vertical-align': 'middle',
      },
    }),
    presetAnimations(),
  ],
  transformers: [transformerDirectives(), transformerVariantGroup()],
  content: {
    filesystem: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  },
  theme: {
    colors: {
      // All colors reference CSS variables from src/assets/styles/index.css
      border: 'hsl(var(--border))',
      input: 'hsl(var(--input))',
      ring: 'hsl(var(--ring))',
      background: 'hsl(var(--background))',
      foreground: 'hsl(var(--foreground))',
      primary: {
        DEFAULT: 'hsl(var(--primary))',
        foreground: 'hsl(var(--primary-foreground))',
      },
      secondary: {
        DEFAULT: 'hsl(var(--secondary))',
        foreground: 'hsl(var(--secondary-foreground))',
      },
      destructive: {
        DEFAULT: 'hsl(var(--destructive))',
        foreground: 'hsl(var(--destructive-foreground))',
      },
      muted: {
        DEFAULT: 'hsl(var(--muted))',
        foreground: 'hsl(var(--muted-foreground))',
      },
      accent: {
        DEFAULT: 'hsl(var(--accent))',
        foreground: 'hsl(var(--accent-foreground))',
      },
      popover: {
        DEFAULT: 'hsl(var(--popover))',
        foreground: 'hsl(var(--popover-foreground))',
      },
      card: {
        DEFAULT: 'hsl(var(--card))',
        foreground: 'hsl(var(--card-foreground))',
      },
    },
    radius: {
      lg: 'var(--radius)',
      md: 'calc(var(--radius) - 2px)',
      sm: 'calc(var(--radius) - 4px)',
    },
    containers: {
      center: true,
      padding: '2rem',
    },
    animation: {
      keyframes: {
        'accordion-down': '{from{height:0}to{height:var(--radix-accordion-content-height)}}',
        'accordion-up': '{from{height:var(--radix-accordion-content-height)}to{height:0}}',
      },
      durations: {
        'accordion-down': '0.2s',
        'accordion-up': '0.2s',
      },
      ease: {
        'accordion-down': 'ease-out',
        'accordion-up': 'ease-out',
      },
    },
  },
  shortcuts: {
    'flex-center': 'flex items-center justify-center',
    'flex-col-center': 'flex flex-col items-center justify-center',
  },
  safelist: [
    // Sidebar nav icons (bound dynamically via :class)
    'i-carbon-equalizer',
    'i-carbon-data-base',
    'i-carbon-table',
    'i-carbon-ibm-watsonx-assistant',
    'i-carbon-folders',
    'i-carbon-expand-all',
    'i-carbon-import-export',
    'i-carbon-logo-github',
    'i-carbon-user-avatar',
    'i-carbon-settings',
    // Button variants
    'bg-destructive',
    'text-destructive-foreground',
    'hover:bg-destructive/90',
    'bg-primary',
    'text-primary-foreground',
    'hover:bg-primary/90',
    'bg-secondary',
    'text-secondary-foreground',
    'hover:bg-secondary/80',
    // Alert variants
    'bg-destructive/10',
    'text-destructive',
    'dark:bg-destructive/15',
    'bg-muted/50',
    'bg-green-50',
    'text-green-700',
    'dark:bg-green-950/30',
    'dark:text-green-400',
    'bg-yellow-50',
    'text-yellow-700',
    'dark:bg-yellow-950/30',
    'dark:text-yellow-400',
    'bg-blue-50',
    'text-blue-700',
    'dark:bg-blue-950/30',
    'dark:text-blue-400',
    // Badge variants
    'bg-primary/80',
    'hover:bg-primary/80',
    'hover:bg-secondary/80',
    'bg-destructive/80',
    'hover:bg-destructive/80',
    'bg-green-500',
    'hover:bg-green-500/80',
    'bg-yellow-500',
    'hover:bg-yellow-500/80',
    'bg-blue-500',
    'hover:bg-blue-500/80',
  ],
});
