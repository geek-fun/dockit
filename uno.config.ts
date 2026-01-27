import {
  defineConfig,
  presetUno,
  presetIcons,
  presetWind,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss';
import presetAnimations from 'unocss-preset-animations';

export default defineConfig({
  presets: [
    presetUno(),
    presetWind(),
    presetIcons({
      scale: 1.2,
      warn: true,
    }),
    presetAnimations(),
  ],
  transformers: [transformerDirectives(), transformerVariantGroup()],
  // Content paths for scanning
  content: {
    filesystem: ['./index.html', './src/**/*.{vue,js,ts,jsx,tsx}'],
  },
  // Theme configuration combining DocKit brand colors and shadcn-vue CSS variables
  theme: {
    colors: {
      // DocKit brand colors
      'dockit-primary': '#36ad6a',
      'dockit-primary-hover': '#19934e',
      'dockit-danger': '#cd2158',
      // shadcn-vue semantic colors (CSS variable based)
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
    borderRadius: {
      lg: 'var(--radius)',
      md: 'calc(var(--radius) - 2px)',
      sm: 'calc(var(--radius) - 4px)',
    },
    container: {
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
      timingFns: {
        'accordion-down': 'ease-out',
        'accordion-up': 'ease-out',
      },
    },
  },
  // Shortcuts for commonly used utility combinations
  shortcuts: {
    'flex-center': 'flex items-center justify-center',
    'flex-col-center': 'flex flex-col items-center justify-center',
  },
  // SafeList for classes that might be dynamically generated
  safelist: [],
});
