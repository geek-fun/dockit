/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}

// Extend Window interface to include MonacoEnvironment
interface Window {
  MonacoEnvironment?: import('monaco-editor').Environment;
}
