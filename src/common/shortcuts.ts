import { register, unregister } from '@tauri-apps/api/globalShortcut';
await unregister('CommandOrControl+S');
await register('CommandOrControl+S', () => {
  console.log('CommandOrControl+S is pressed');
  window.dispatchEvent(new Event('saveFile'));
});
