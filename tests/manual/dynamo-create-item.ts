import { createApp, h, ref } from 'vue';
import { createPinia, setActivePinia } from 'pinia';
import { mockIPC } from '@tauri-apps/api/mocks';
import { lang } from '../../src/lang';
import 'virtual:uno.css';
import '../../src/assets/styles/index.css';

Object.assign(window, { __TAURI_OS_PLUGIN_INTERNALS__: { platform: 'macos', arch: 'aarch64' } });
const requests = ref<Record<string, unknown>[]>([]);
const schemaDelay = Number(new URLSearchParams(window.location.search).get('schemaDelay') ?? 200);
document.documentElement.setAttribute(
  'theme',
  new URLSearchParams(window.location.search).get('theme') === 'dark' ? 'dark' : 'light',
);
const connection = {
  id: 99999,
  name: 'QA only',
  type: 'DYNAMODB' as const,
  region: 'us-east-1',
  auth: { kind: 'accessKey' as const, accessKeyId: 'test', secretAccessKey: 'test' },
  tables: [{ name: 'qa_num' }, { name: 'qa_str' }, { name: 'qa_denied' }],
};
let duplicate = false;
mockIPC(async (command, args) => {
  if (command !== 'invoke_capability') return null;
  const { name, args: params } = args as { name: string; args: Record<string, unknown> };
  if (name === 'dynamo__describe_table') {
    const tableName = params.table_name as string;
    await new Promise(resolve => setTimeout(resolve, schemaDelay));
    if (tableName === 'qa_denied')
      return JSON.stringify({ status: 403, message: 'QA simulated access denied', data: null });
    return JSON.stringify({
      status: 200,
      data: {
        name: tableName,
        keySchema:
          tableName === 'qa_num'
            ? [{ attributeName: 'id', keyType: 'HASH' }]
            : [
                { attributeName: 'pk', keyType: 'HASH' },
                { attributeName: 'sk', keyType: 'RANGE' },
              ],
        attributeDefinitions:
          tableName === 'qa_num'
            ? [{ attributeName: 'id', attributeType: 'N' }]
            : [
                { attributeName: 'pk', attributeType: 'S' },
                { attributeName: 'sk', attributeType: 'N' },
                { attributeName: 'gsi', attributeType: 'S' },
              ],
        indices: [],
        status: 'ACTIVE',
        itemCount: 0,
      },
    });
  }
  if (name === 'dynamo__create_item') {
    requests.value = [...requests.value, JSON.parse(JSON.stringify(params))];
    return JSON.stringify({ status: 200, data: { created: !duplicate, skipped: duplicate } });
  }
  return JSON.stringify({ status: 200, data: {} });
});
Object.assign(window.__TAURI_INTERNALS__, { plugins: { path: { sep: '/', delimiter: ':' } } });
const pinia = createPinia();
setActivePinia(pinia);
const { useConnectionStore, useTabStore, useAppStore } = await import('../../src/store');
const { default: CreateItem } =
  await import('../../src/views/editor/dynamo-editor/components/create-item.vue');
const appStore = useAppStore(pinia);
const editorOptions = appStore.getEditorOptions;
appStore.getEditorOptions = () => ({ ...editorOptions(), editContext: false });
const store = useConnectionStore(pinia);
store.connections = [connection];
const tabs = useTabStore(pinia);
tabs.activePanel.connection = connection;
tabs.activePanel.activeTable = '';
tabs.activePanel.editorType = 'DYNAMO_EDITOR_CREATE_ITEM';
const app = createApp({
  setup: () => () =>
    h('main', { style: 'height:100vh;display:flex;flex-direction:column;padding:16px;gap:12px' }, [
      h('header', { class: 'flex gap-4 items-center' }, [
        h('strong', 'Create Item QA — mock transport, real component/stores'),
        h(
          'select',
          {
            'aria-label': 'QA table',
            value: tabs.activePanel.activeTable,
            onChange: (event: Event) => {
              tabs.setActiveTable((event.target as HTMLSelectElement).value);
            },
          },
          [
            h('option', { value: '' }, 'Select a table'),
            ...connection.tables.map(table => h('option', { value: table.name }, table.name)),
          ],
        ),
        h('label', [
          h('input', {
            type: 'checkbox',
            onChange: (event: Event) => {
              duplicate = (event.target as HTMLInputElement).checked;
            },
          }),
          ' Simulate duplicate',
        ]),
      ]),
      h(CreateItem),
      h(
        'pre',
        { 'aria-label': 'Submitted requests', class: 'max-h-40 overflow-auto text-xs' },
        JSON.stringify(requests.value, null, 2),
      ),
    ]),
});
app.use(pinia);
app.use(lang);
app.mount('#app');
