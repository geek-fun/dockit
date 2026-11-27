export type ToolCallArgs = Record<string, unknown>;

export type ArgBlockLanguage = 'sql' | 'json' | 'text';

export type ArgBlock =
  | { kind: 'code'; key: string; language: ArgBlockLanguage; text: string }
  | { kind: 'field'; key: string; value: string };

export type ImpactHint = 'noWhereClause' | 'dropsObject' | 'truncates' | 'multipleStatements';

export type ToolOperation = {
  verb: string;
  object?: string;
};

export type ToolCallPresentation = {
  target: string | null;
  operation: ToolOperation | null;
  hints: ImpactHint[];
  blocks: ArgBlock[];
};

const SQL_ARG_KEYS = new Set(['sql', 'statement', 'partiql']);
const QUERY_ARG_KEYS = new Set(['query']);
const TARGET_OBJECT_KEYS = [
  'table_name',
  'table',
  'index',
  'collection',
  'alias',
  'database',
  'schema',
  'name',
] as const;
const LONG_TEXT_THRESHOLD = 100;

const IDENT_SEGMENT = '(?:["`[][^"`\\]]+["`\\]]|[a-z_][\\w$]*)';
const QUALIFIED_IDENT = `(${IDENT_SEGMENT}(?:\\s*\\.\\s*${IDENT_SEGMENT})*)`;

const SQL_OPERATION_PATTERNS: ReadonlyArray<{ verb: string; pattern: RegExp }> = [
  {
    verb: 'INSERT',
    pattern: new RegExp(`^INSERT\\s+(?:OR\\s+\\w+\\s+|IGNORE\\s+)?INTO\\s+${QUALIFIED_IDENT}`, 'i'),
  },
  { verb: 'REPLACE', pattern: new RegExp(`^REPLACE\\s+INTO\\s+${QUALIFIED_IDENT}`, 'i') },
  { verb: 'UPDATE', pattern: new RegExp(`^UPDATE\\s+(?:ONLY\\s+)?${QUALIFIED_IDENT}`, 'i') },
  {
    verb: 'DELETE',
    pattern: new RegExp(`^DELETE\\s+FROM\\s+(?:ONLY\\s+)?${QUALIFIED_IDENT}`, 'i'),
  },
  { verb: 'DELETE', pattern: new RegExp(`^DELETE\\s+(?!FROM\\b)${QUALIFIED_IDENT}`, 'i') },
  { verb: 'MERGE', pattern: new RegExp(`^MERGE\\s+INTO\\s+${QUALIFIED_IDENT}`, 'i') },
  {
    verb: 'TRUNCATE',
    pattern: new RegExp(`^TRUNCATE\\s+(?:TABLE\\s+)?(?:ONLY\\s+)?${QUALIFIED_IDENT}`, 'i'),
  },
  {
    verb: 'DROP',
    pattern: new RegExp(
      `^DROP\\s+(?:MATERIALIZED\\s+VIEW|TABLE|INDEX|VIEW|SCHEMA|DATABASE|TRIGGER|FUNCTION|PROCEDURE|TYPE|SEQUENCE|KEYSPACE|ROLE|USER)\\s+(?:IF\\s+EXISTS\\s+)?${QUALIFIED_IDENT}`,
      'i',
    ),
  },
  {
    verb: 'ALTER',
    pattern: new RegExp(
      `^ALTER\\s+(?:MATERIALIZED\\s+VIEW|TABLE|INDEX|VIEW|SCHEMA|DATABASE|TYPE|SEQUENCE|KEYSPACE|ROLE|USER)\\s+(?:IF\\s+EXISTS\\s+)?${QUALIFIED_IDENT}`,
      'i',
    ),
  },
  {
    verb: 'CREATE',
    pattern: new RegExp(
      `^CREATE\\s+(?:OR\\s+REPLACE\\s+)?(?:TEMP(?:ORARY)?\\s+|UNIQUE\\s+|MATERIALIZED\\s+)?(?:TABLE|INDEX|VIEW|SCHEMA|DATABASE|TRIGGER|FUNCTION|PROCEDURE|TYPE|SEQUENCE|KEYSPACE|ROLE|USER)\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${QUALIFIED_IDENT}`,
      'i',
    ),
  },
];

const isPlainObject = (value: unknown): value is ToolCallArgs =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const parseJsonOnce = (input: string): { ok: true; value: unknown } | { ok: false } => {
  try {
    return { ok: true, value: JSON.parse(input) };
  } catch {
    return { ok: false };
  }
};

export const parseToolArguments = (raw: unknown): ToolCallArgs => {
  if (isPlainObject(raw)) return raw;

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return {};
    const parsed = parseJsonOnce(trimmed);
    if (parsed.ok && isPlainObject(parsed.value)) return parsed.value;
  }

  return {};
};

const tryFormatJsonString = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const parsed = parseJsonOnce(trimmed);
    if (parsed.ok && parsed.value !== null && typeof parsed.value === 'object') {
      return JSON.stringify(parsed.value, null, 2);
    }
  }

  const lines = trimmed
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean);

  if (lines.length >= 2 && lines.every(line => line.startsWith('{'))) {
    const parsedLines = lines.map(parseJsonOnce);
    if (parsedLines.every(item => item.ok && isPlainObject(item.value))) {
      return parsedLines
        .map(item => JSON.stringify((item as { ok: true; value: unknown }).value, null, 2))
        .join('\n');
    }
  }

  return null;
};

export const toArgBlocks = (args: ToolCallArgs): ArgBlock[] => {
  const blocks = Object.entries(args)
    .filter(([key, value]) => key !== 'connection_id' && value !== undefined)
    .map(([key, value]): ArgBlock => {
      const lowerKey = key.toLowerCase();

      if (typeof value === 'string') {
        if (SQL_ARG_KEYS.has(lowerKey)) return { kind: 'code', key, language: 'sql', text: value };

        if (QUERY_ARG_KEYS.has(lowerKey)) {
          const jsonFormatted = tryFormatJsonString(value);
          return jsonFormatted
            ? { kind: 'code', key, language: 'json', text: jsonFormatted }
            : { kind: 'code', key, language: 'sql', text: value };
        }

        const jsonFormatted = tryFormatJsonString(value);
        if (jsonFormatted) return { kind: 'code', key, language: 'json', text: jsonFormatted };

        if (value.includes('\n') || value.length > LONG_TEXT_THRESHOLD) {
          return { kind: 'code', key, language: 'text', text: value };
        }

        return { kind: 'field', key, value };
      }

      if (value !== null && typeof value === 'object') {
        return {
          kind: 'code',
          key,
          language: 'json',
          text: JSON.stringify(value, null, 2),
        };
      }

      return { kind: 'field', key, value: String(value) };
    });

  const fields = blocks.filter(block => block.kind === 'field');
  const codeBlocks = blocks.filter(block => block.kind === 'code');
  return [...fields, ...codeBlocks];
};

const stripSqlCommentsAndLiterals = (sql: string): string =>
  sql.replace(/--[^\n]*|\/\*[\s\S]*?\*\/|(\$\w*\$)[\s\S]*?\1|'(?:''|\\'|[^'])*'/g, match =>
    match.startsWith('--') || match.startsWith('/*') ? ' ' : "''",
  );

const cleanIdentifier = (raw: string): string =>
  raw
    .split('.')
    .map(part => part.trim().replace(/^[`"[]|[`"\]]$/g, ''))
    .join('.');

const extractSqlOperation = (statement: string): ToolOperation | null => {
  const trimmed = statement.trim();
  if (!trimmed) return null;

  const matched = SQL_OPERATION_PATTERNS.map(({ verb, pattern }) => ({
    verb,
    match: trimmed.match(pattern),
  })).find(entry => entry.match !== null);

  if (matched?.match) {
    return {
      verb: matched.verb,
      object: matched.match[1] ? cleanIdentifier(matched.match[1]) : undefined,
    };
  }

  const leadingVerb = trimmed.match(/^([a-z]+)/i);
  return leadingVerb ? { verb: leadingVerb[1].toUpperCase() } : null;
};

export const describeSqlImpact = (
  sql: string,
): { operation: ToolOperation | null; hints: ImpactHint[] } => {
  const stripped = stripSqlCommentsAndLiterals(sql);
  const statements = stripped
    .split(';')
    .map(segment => segment.trim())
    .filter(Boolean);

  if (statements.length === 0) return { operation: null, hints: [] };

  const operation = extractSqlOperation(statements[0]);
  const hints: ImpactHint[] = [
    ...(statements.some(stmt => /\bDROP\b/i.test(stmt)) ? ['dropsObject' as const] : []),
    ...(statements.some(stmt => /\bTRUNCATE\b/i.test(stmt)) ? ['truncates' as const] : []),
    ...(statements.some(stmt => /^(?:UPDATE|DELETE)\b/i.test(stmt) && !/\bWHERE\b/i.test(stmt))
      ? ['noWhereClause' as const]
      : []),
    ...(statements.length > 1 ? ['multipleStatements' as const] : []),
  ];

  return { operation, hints };
};

const deriveToolOperation = (
  toolName: string,
  args: ToolCallArgs,
): { operation: ToolOperation | null; hints: ImpactHint[] } => {
  const actionPart = toolName.includes('__')
    ? toolName.slice(toolName.indexOf('__') + 2)
    : toolName;
  const normalizedAction = actionPart.trim().toLowerCase();
  if (!normalizedAction) return { operation: null, hints: [] };

  const objectKey = TARGET_OBJECT_KEYS.find(
    key => typeof args[key] === 'string' && (args[key] as string).trim().length > 0,
  );
  const object = objectKey ? (args[objectKey] as string).trim() : undefined;
  const verb = normalizedAction.replace(/_/g, ' ').toUpperCase();

  const hints: ImpactHint[] = [
    ...(/(?:^|_)(?:delete_index|delete_table|delete_gsi|drop_collection|drop_database|delete_collection)(?:$|_)/.test(
      normalizedAction,
    )
      ? ['dropsObject' as const]
      : []),
    ...(normalizedAction.includes('truncate') ? ['truncates' as const] : []),
  ];

  return { operation: { verb, object }, hints };
};

export const presentToolCall = (toolName: string, args: ToolCallArgs): ToolCallPresentation => {
  const rawTarget = args.connection_id;
  const target = typeof rawTarget === 'string' && rawTarget.trim() ? rawTarget.trim() : null;
  const blocks = toArgBlocks(args);

  const sqlBlock = blocks.find(
    (block): block is Extract<ArgBlock, { kind: 'code' }> =>
      block.kind === 'code' && block.language === 'sql',
  );

  const { operation, hints } = sqlBlock
    ? describeSqlImpact(sqlBlock.text)
    : deriveToolOperation(toolName, args);

  return {
    target,
    operation,
    hints,
    blocks,
  };
};
