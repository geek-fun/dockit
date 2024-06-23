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

type ApiClientResponse = {
  status: number;
  message: string;
  data: { [key: string]: unknown };
};
export const tauriClient = {
  invoke: async (command: string, payload: unknown): Promise<ApiClientResponse> => {
    try {
      const result = await invoke<string>(command, payload as InvokeArgs);
      const { status, message, data } = JSON.parse(result) as ApiClientResponse;
      console.log('tauriClient.invoke result', { status, message, data });
      return { status, message, data };
    } catch (err) {
      console.log('tauriClient.invoke error', err);
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
