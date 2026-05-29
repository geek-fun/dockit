import { watch } from 'vue';
import * as monaco from 'monaco-editor';
import { useTabStore } from '@/store/tabStore';

/**
 * Unified code insertion composable.
 *
 * Watches tabStore.pendingInsertToken and inserts the pending query
 * into the given Monaco editor.
 *
 * Always inserts on a new line — never modifies the current line.
 *
 * Two modes (controlled by tabStore.pendingInsertMode):
 *   'cursor'        — insert on a new line after the cursor's line
 *   'append_bottom'  — append to the end of the document
 *
 * In both modes the cursor moves to the first line of inserted content.
 *
 * Usage in any editor component:
 *   useEditorInsertCode(() => queryEditor)
 */
export const useEditorInsertCode = (
  getEditor: () => monaco.editor.IStandaloneCodeEditor | null,
) => {
  const tabStore = useTabStore();

  watch(
    () => tabStore.pendingInsertToken,
    () => {
      const query = tabStore.pendingInsertQuery;
      const mode = tabStore.pendingInsertMode;
      const editor = getEditor();
      if (!query || !editor) return;

      const model = editor.getModel();
      if (!model) return;

      // Determine which line to insert after
      let anchorLine: number;

      if (mode === 'append_bottom') {
        // Always after the last line
        anchorLine = model.getLineCount();
      } else {
        // Sidebar: after the cursor's current line; if no cursor, at bottom
        const position = editor.getPosition();
        anchorLine = position?.lineNumber ?? model.getLineCount();
      }

      // Insert on a new line after anchorLine
      // Append a trailing newline to the anchor line so the query goes on its own line
      const lineLength = model.getLineLength(anchorLine);
      const insertRange = new monaco.Range(anchorLine, lineLength + 1, anchorLine, lineLength + 1);

      model.pushEditOperations([], [{ range: insertRange, text: `\n${query}` }], () => null);

      // Move cursor to the first line of the inserted content
      const insertedLine = anchorLine + 1;
      editor.setPosition({ lineNumber: insertedLine, column: 1 });
      editor.revealLine(insertedLine);
      tabStore.clearPendingInsertQuery();
    },
  );
};
