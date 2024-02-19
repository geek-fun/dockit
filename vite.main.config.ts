import { defineConfig } from 'vite';

// https://vitejs.dev/config
export default defineConfig({
  resolve: {
    // Some libs that can run in both Web and Node.js, such as `axios`, we need to tell Vite to build them in Node.js.
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    browserField: false,
    mainFields: ['module', 'jsnext:main', 'jsnext'],
  },
});
