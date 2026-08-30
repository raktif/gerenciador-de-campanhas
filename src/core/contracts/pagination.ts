export const defaultPageLimit = 50;
export const maximumPageLimit = 100;

export interface PageRequest<TFilter, TSort extends string> {
  cursor?: string;
  limit?: number;
  filters?: TFilter;
  sort?: TSort;
  order?: 'asc' | 'desc';
}

export interface PageResult<T> {
  items: T[];
  nextCursor: string | null;
  total?: number;
}
