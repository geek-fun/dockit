import { register } from '@tauri-apps/api/globalShortcut';
import { debug } from './debug.ts';
await register('CommandOrControl+S', () => {
  debug('CommandOrControl+S is pressed');
  window.dispatchEvent(new Event('saveFile'));
});
