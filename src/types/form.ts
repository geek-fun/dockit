/**
 * Form Types
 *
 * Type definitions for form validation that provide compatibility
 * during the migration from Naive UI to shadcn-vue forms.
 *
 * These types mirror the Naive UI form types for backward compatibility.
 */

export interface FormItemRule {
  required?: boolean;
  message?: string;
  trigger?: string | string[];
  validator?: (rule: FormItemRule, value: unknown) => boolean | Error | Promise<boolean | Error>;
  renderMessage?: () => string;
  level?: 'error' | 'warning';
  type?:
    | 'string'
    | 'number'
    | 'boolean'
    | 'method'
    | 'regexp'
    | 'integer'
    | 'float'
    | 'array'
    | 'object'
    | 'enum'
    | 'date'
    | 'url'
    | 'hex'
    | 'email';
  pattern?: RegExp;
  min?: number;
  max?: number;
  len?: number;
  enum?: Array<string | number | boolean | null | undefined>;
  whitespace?: boolean;
  transform?: (value: unknown) => unknown;
  asyncValidator?: (
    rule: FormItemRule,
    value: unknown,
    callback: (error?: Error) => void,
  ) => Promise<void> | void;
}

export type FormRules = {
  [key: string]: FormItemRule | FormItemRule[];
};

export interface FormValidationError {
  field: string;
  message: string;
}

export interface FormInst {
  validate: (
    callback?: (errors: FormValidationError[] | undefined) => void,
  ) => Promise<void> | void;
  restoreValidation: () => void;
}

/**
 * Data Table Types
 *
 * Type definitions for data tables that provide compatibility
 * during the migration from Naive UI to custom/shadcn-vue tables.
 */

import type { VNodeChild } from 'vue';

export interface DataTableColumn<T = unknown> {
  title?: string | (() => VNodeChild);
  key: string;
  width?: number | string;
  minWidth?: number | string;
  maxWidth?: number | string;
  fixed?: 'left' | 'right' | boolean;
  align?: 'left' | 'center' | 'right';
  ellipsis?: boolean | { tooltip?: boolean };
  sorter?: boolean | 'default' | ((rowA: T, rowB: T) => number);
  sortOrder?: 'ascend' | 'descend' | false;
  filter?: boolean | ((filterOptionValue: string, row: T) => boolean);
  filterOptions?: Array<{ label: string; value: string }>;
  filteredValue?: string[] | null;
  render?: (row: T, index: number) => VNodeChild;
  type?: 'selection' | 'expand';
  disabled?: (row: T) => boolean;
  className?: string;
  colSpan?: (row: T, index: number) => number;
  rowSpan?: (row: T, index: number) => number;
  children?: DataTableColumn<T>[];
}

export interface PaginationProps {
  page?: number;
  pageSize?: number;
  pageCount?: number;
  itemCount?: number;
  showSizePicker?: boolean;
  pageSizes?: number[];
  showQuickJumper?: boolean;
  disabled?: boolean;
  prefix?: (info: { page: number; pageSize: number; itemCount: number }) => VNodeChild;
  suffix?: (info: { page: number; pageSize: number; itemCount: number }) => VNodeChild;
}
