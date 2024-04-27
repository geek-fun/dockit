import { CustomError } from './customError';
import { Buffer } from 'buffer';
import { lang } from '../lang';
import { Range } from './editor';

const { fetchApi } = window;

const handleFetch = (result: { data: unknown; status: number; details: string }) => {
  if ([404, 400].includes(result.status) || (result.status >= 200 && result.status < 300)) {
    return result.data || JSON.parse(result.details);
  }
  if (result.status === 401) {
    throw new CustomError(result.status, lang.global.t('connection.unAuthorized'));
  }
  throw new CustomError(result.status, result.details);
};

const buildURL = (host: string, port: number, path?: string, queryParameters?: string) => {
  let url = `${host}:${port}`;
  url += path ?? '';
  url += queryParameters ? `?${queryParameters}` : '';

  return url;
};
const fetchWrapper = async ({
  method,
  path,
  queryParameters,
  payload,
  host,
  port,
  username,
  password,
  ssl,
}: {
  method: string;
  path?: string;
  queryParameters?: string;
  payload?: string;
  username?: string;
  password?: string;
  host: string;
  port: number;
  ssl: boolean;
}) => {
  const authorization =
    username || password
      ? `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`
      : undefined;

  const url = buildURL(host, port, path, queryParameters);
  const { data, status, details } = await fetchApi.fetch(url, {
    method,
    headers: {
      authorization,
    },
    payload: payload ? JSON.stringify(payload) : undefined,
    agent: { ssl },
  });
  return handleFetch({ data, status, details });
};

export const loadHttpClient = (con: {
  host: string;
  port: number;
  username?: string;
  password?: string;
  sslCertVerification: boolean;
}) => ({
  get: async (path?: string, queryParameters?: string) =>
    fetchWrapper({
      ...con,
      method: 'GET',
      path,
      queryParameters,
      ssl: con.sslCertVerification,
    }),
  post: async (path: string, queryParameters?: string, payload?: string) =>
    fetchWrapper({
      ...con,
      method: 'POST',
      path,
      queryParameters,
      payload,
      ssl: con.sslCertVerification,
    }),
  put: async (path: string, queryParameters?: string, payload?: string) =>
    fetchWrapper({
      ...con,
      method: 'PUT',
      path,
      queryParameters,
      payload,
      ssl: con.sslCertVerification,
    }),

  delete: async (path: string, queryParameters?: string, payload?: string) =>
    fetchWrapper({
      ...con,
      method: 'DELETE',
      path,
      queryParameters,
      payload,
      ssl: con.sslCertVerification,
    }),
});

export interface AiClient {
  suggest: (fileContent: string, range: Range) => Promise<{ choices: Array<{ text: string }> }>;
}

const MODEL = 'gpt-3.5-turbo-0125';

const OPENAI_API_KEY = import.meta.env.VITE_OPEN_AI_API_KEY as string;

export const loadAiClient = async () => {
  const headers = {
    'Content-Type': 'application/json',
    'OpenAI-Beta': 'assistants=v1',
    Authorization: `Bearer ${OPENAI_API_KEY}`,
  };
  // Step 1: Create an Assistant
  const { status, details } = await fetchApi.fetch('https://api.openai.com/v1/assistants', {
    method: 'POST',
    headers,
    payload: JSON.stringify({
      instructions: 'You are a personal math tutor. Write and run code to answer math questions.',
      name: 'Math Tutor',
      tools: [{ type: 'code_interpreter' }],
      model: MODEL,
    }),
  });
  if (status !== 200) {
    throw new CustomError(status, details);
  }
  // Step 2: Create a Thread
  const { data: thread, status: threadStatus } = await fetchApi.fetch(
    `https://api.openai.com/v1/threads`,
    {
      method: 'POST',
      headers,
      payload: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: 'You are a personal math tutor. Write and run code to answer math questions.',
          },
        ],
      }),
    },
  );

  if (threadStatus !== 200) {
    throw new CustomError(status, details);
  }
  const threadId = (thread as { id: string }).id;
  return {
    suggest: async (fileContent: string, range: Range) => {
      // Step 3: Add a Message to the Thread
      const { data } = await fetchApi.fetch(
        `https://api.openai.com/v1/threads/${threadId}).id}/messages`,
        {
          method: 'POST',
          headers,
          payload: JSON.stringify({
            messages: [
              {
                role: 'system',
                content: fileContent,
                current_line_number: range.startLineNumber,
                current_column_number: range.startColumn,
                end_line_number: range.endLineNumber,
                end_column_number: range.endColumn,
              },
            ],
          }),
        },
      );
      return data as { choices: Array<{ text: string }> };
    },
  } as AiClient;
};
