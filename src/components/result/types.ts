export type ViewMode = 'table' | 'tree' | 'json';

/** Result page-size choices, uniform across every database engine. */
export const PAGE_SIZE_OPTIONS = [25, 50, 100, 200] as const;

export type PaginationMode = 'offset' | 'cursor' | 'client';

export type PaginationConfig = {
  mode: PaginationMode;
  page?: number;
  pageSize?: number;
  pageSizeOptions?: number[];
  hasNext?: boolean;
  total?: number;
};

export type ColumnDef = {
  key: string;
  title: string;
  width?: number | string;
  align?: 'left' | 'center' | 'right';
  ellipsis?: boolean;
  className?: string;
  sticky?: 'left' | 'right';
  /** Engine-provided data type shown as a hint in the column header. */
  dataType?: string;
};
