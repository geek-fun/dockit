/**
 * refer https://github.com/wobsoriano/codeplayground
 * https://github.com/wobsoriano/codeplayground/blob/master/src/components/MonacoEditor.vue
 */
export const monacoEnvironment = {
  // @ts-ignore
  async getWorker(_, label) {
    let worker;

    switch (label) {
      case 'json':
        // @ts-ignore
        worker = await import('monaco-editor/esm/vs/language/json/json.worker?worker');
        break;
      case 'css':
      case 'scss':
      case 'less':
        // @ts-ignore
        worker = await import('monaco-editor/esm/vs/language/css/css.worker?worker');
        break;
      case 'html':
      case 'handlebars':
      case 'razor':
        // @ts-ignore
        worker = await import('monaco-editor/esm/vs/language/html/html.worker?worker');
        break;
      case 'typescript':
      case 'javascript':
        // @ts-ignore
        worker = await import('monaco-editor/esm/vs/language/typescript/ts.worker?worker');
        break;
      default:
        // @ts-ignore
        worker = await import('monaco-editor/esm/vs/editor/editor.worker?worker');
    }

    return new worker.default();
  },
};
