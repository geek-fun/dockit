import {
  defineConfig,
  presetUno,
  presetIcons,
  transformerDirectives,
  transformerVariantGroup,
} from 'unocss';

export default defineConfig({
  presets: [
    presetUno(),
    presetIcons({
      scale: 1.2,
      warn: true,
    }),
  ],
  transformers: [transformerDirectives(), transformerVariantGroup()],
  // Theme tokens matching the existing DocKit brand colors
  theme: {
    colors: {
      // DocKit primary green
      'dockit-primary': '#36ad6a',
      'dockit-primary-hover': '#19934e',
      // DocKit danger red
      'dockit-danger': '#cd2158',
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
