export type ViewMode = 'table' | 'tree' | 'json';

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
};
