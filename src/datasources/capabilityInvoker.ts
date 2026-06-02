import { invoke } from '@tauri-apps/api/core';
import { jsonify, CustomError } from '../common';

// ============================================================================
// Shared invoke — calls Rust invoke_capability with connection_id
// ============================================================================

export const invokeCapability = async (
  name: string,
  args: Record<string, unknown>,
  connectionId?: string | null,
): Promise<string> => {
  return await invoke<string>('invoke_capability', {
    name,
    args,
    connectionId: connectionId ?? null,
  });
};

// ============================================================================
// Unified response parser for all capability handlers.
//
// Every capability handler (ES, DynamoDB, MongoDB) now returns the same
// envelope: `{ status: number, data?: T, message?: string }`.
//   - status >= 400 → throws CustomError
//   - status < 400  → returns data (typed as T) without wrapper fields
// ============================================================================

export const parseCapabilityResponse = <T>(raw: string): T => {
  const parsed = jsonify.parse(raw) as { status: number; data?: T; message?: string };
  if (parsed.status >= 400) {
    throw new CustomError(parsed.status, parsed.message || 'Request failed');
  }
  if (parsed.data === null || parsed.data === undefined) {
    throw new CustomError(500, 'Response missing data field');
  }
  return parsed.data as T;
};

export type ApiResponse<T = unknown> = {
  status: number;
  data?: T;
  message?: string;
};

export const parseDirectResponse = async <T>(
  command: string,
  args: Record<string, unknown>,
): Promise<T> => {
  const response = await invoke<ApiResponse<T>>(command, args);
  if (response.status >= 400) {
    throw new CustomError(response.status, response.message || 'Request failed');
  }
  return (response.data ?? null) as T;
};
