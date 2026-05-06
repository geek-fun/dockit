import { BackendType } from '../types';

export type LanguageToken = {
  label: string;
  insertText: string;
  description: string;
  sortOrder?: number;
};

export type BodyFieldDef = {
  label: string;
  snippet: string;
  description: string;
  sortOrder: number;
};

export type MonarchTokenRule = [RegExp, Record<string, unknown> | string];

export type QueryLanguageDef = {
  id: string;
  endpointPaths: string[];
  backends: BackendType[];
  queryFieldKey: string;
  /** Root body fields for this endpoint. Can be a static array or a function
   *  receiving the backend for backend-specific field sets. */
  bodyFields: BodyFieldDef[] | ((backend: BackendType) => BodyFieldDef[]);

  syntax: {
    commands: LanguageToken[];
    functions: LanguageToken[];
    operators: string[];
    dataTypes: string[];
  };

  monarchTokens: MonarchTokenRule[];
};
