import { invoke } from '@tauri-apps/api/core';
import {
  AI_ACTIONS,
  aiPreset,
  getAiPolicy,
  resolveAiPermissions,
  saveAiPermissions,
} from '@/common/aiPermissions';
jest.mock('@tauri-apps/api/core', () => ({ invoke: jest.fn() }));
describe('AI permission chain', () => {
  it('resolves explicit allow and deny independently while omitted actions inherit', () => {
    expect(resolveAiPermissions(aiPreset('full'), { update: false })).toEqual({
      read: true,
      create: true,
      update: false,
      delete: true,
      manage: true,
    });
    expect(resolveAiPermissions({}, { read: true })).toEqual(aiPreset('read'));
  });
  it('distinguishes inheritance from no access and keeps management out of data permissions', () => {
    expect(aiPreset('inherit')).toEqual({});
    expect(AI_ACTIONS.every(action => aiPreset('none')[action] === false)).toBe(true);
    expect(aiPreset('data')).toEqual({
      read: true,
      create: true,
      update: true,
      delete: true,
      manage: false,
    });
  });
  it('loads the shared policy and saves a single connection without overwriting defaults', async () => {
    await getAiPolicy();
    expect(invoke).toHaveBeenLastCalledWith('get_ai_permissions');
    await saveAiPermissions('42', { update: false });
    expect(invoke).toHaveBeenLastCalledWith('save_ai_permissions', {
      connectionId: '42',
      permissions: { update: false },
    });
  });
});
