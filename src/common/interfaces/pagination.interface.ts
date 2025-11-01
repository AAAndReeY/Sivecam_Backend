export interface PaginationQuery {
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  currentPage: number;
  pageCount: number;
  totalCount: number;
  totalPages: number;
}
