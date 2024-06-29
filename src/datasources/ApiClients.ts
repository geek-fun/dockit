import { invoke, InvokeArgs } from '@tauri-apps/api/tauri';

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
      return { status, message, data };
    } catch (err) {
      const { status, message, data } = JSON.parse(err as string) as ApiClientResponse;
      throw new ApiClientError(status, message, JSON.stringify(data));
    }
  },
};
