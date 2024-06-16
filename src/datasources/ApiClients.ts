import { InvokeArgs, invoke } from '@tauri-apps/api/tauri';
import { get } from 'lodash';
export class ApiClientError extends Error {
  public status: number;
  public details?: string;
  constructor(status: number, message: string, details?: string) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const tauriClient = {
  invoke: async (command: string, payload: unknown) => {
    try {
      const { status, data, message } = await invoke<{
        status: number;
        message: string;
        data: { [key: string]: unknown };
      }>(command, payload as InvokeArgs);
      if (status !== 200) {
        throw new ApiClientError(status, message);
      }
      return data as { assistantId: string; threadId: string };
    } catch (err) {
      const status = get(err, 'status', get(err, 'code', 500));
      const message = get(err, 'message', err) as string;
      const stack = get(err, 'stack', get(err, 'details', ''));
      console.log('tauriClient.invoke', { status, message, stack });
      if (err instanceof ApiClientError) {
        throw err;
      }
      throw new ApiClientError(status, message);
    }
  },
};
