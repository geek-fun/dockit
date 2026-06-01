import { invoke } from '@tauri-apps/api/core';
import { jsonify } from '../common';

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
// Response parsers (keep, not db-specific)
// ============================================================================

// ES response parser: extracts data from { status, data } envelope
export const parseEsCapabilityResponse = <T>(raw: string): T => {
  const parsed = jsonify.parse(raw) as { status: number; data: T };
  return parsed.data;
};

export const parseDynamoCapabilityResponse = <T>(raw: string): T => {
  const parsed = jsonify.parse(raw) as { status: number; message: string; data: T };
  return parsed.data;
};

// MongoDB response is direct JSON string
export const parseMongoCapabilityResponse = <T>(raw: string): T => {
  return jsonify.parse(raw) as T;
};
