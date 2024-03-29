import { CustomError } from './customError';
import { Buffer } from 'buffer';
import { lang } from '../lang';

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
  payload?: unknown;
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
    authorization,
    payload: payload ? JSON.stringify(payload) : undefined,
    ssl,
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
  post: async (path: string, queryParameters?: string, payload?: unknown) =>
    fetchWrapper({
      ...con,
      method: 'POST',
      path,
      queryParameters,
      payload,
      ssl: con.sslCertVerification,
    }),
  put: async (path: string, queryParameters?: string, payload?: unknown) =>
    fetchWrapper({
      ...con,
      method: 'PUT',
      path,
      queryParameters,
      payload,
      ssl: con.sslCertVerification,
    }),

  delete: async (path: string, queryParameters?: string, payload?: unknown) =>
    fetchWrapper({
      ...con,
      method: 'DELETE',
      path,
      queryParameters,
      payload,
      ssl: con.sslCertVerification,
    }),
});

const MODEL = 'gpt-3.5-turbo-0125';
let assistant = null;
export const loadAiClient = async () => {
  const headers = {
    'Content-Type': 'application/json',
    'OpenAI-Beta': 'assistants=v1',
    Authorization: `Bearer ${OPENAI_API_KEY}`,
  };
  const { data, status, details } = await fetchApi.fetch('https://api.openai.com/v1/assistants', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      instructions: 'You are a personal math tutor. Write and run code to answer math questions.',
      name: 'Math Tutor',
      tools: [{ type: 'code_interpreter' }],
      model: MODEL,
    }),
  });
  assistant = data as { id: string };
  const { data: thread, status: threadStatus } = await fetchApi.fetch(
    `https://api.openai.com/v1/assistants/${assistant.id}/threads`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: 'You are a personal math tutor. Write and run code to answer math questions.',
          },
        ],
      }),
    },
  );

  console.log(`gpt assistant: ${assistant}, thread ${thread}`);
  if (status !== 200) {
    throw new CustomError(status, details);
  }
  return {
    suggest: async (fileContent: string, currentLineNumber: number) => {
      const { data, status, details } = await fetchApi.fetch(
        `https://api.openai.com/v1/threads/${(thread as { id: string }).id}/messages`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            messages: [
              {
                role: 'system',
                content: fileContent,
                current_line_number: currentLineNumber,
              },
            ],
          }),
        },
      );
      console.log(`gpt suggest: ${data}, status: ${status}, details: ${details}`);
      return (data as { choices: Array<{ text: string }> }).choices[0].text.trim();
    },
  };
};
