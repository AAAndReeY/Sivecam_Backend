import { PaginatedResult, PaginationQuery } from '../interfaces';

export async function paginationHelper<T>(
  model: {
    findMany: (args: any) => Promise<T[]>;
    count: (args: any) => Promise<number>;
  },
  args: {
    where?: any;
    orderBy?: any;
    include?: any;
    select?: any;
  },
  pagination: PaginationQuery,
): Promise<PaginatedResult<T>> {
  const { page = 1, limit = 10 } = pagination;
  if (page === 0) {
    const data = await model.findMany(args);
    const totalCount = data.length;
    return {
      data,
      currentPage: 0,
      pageCount: totalCount,
      totalCount,
      totalPages: 1,
    };
  }
  const skip = (page - 1) * limit;
  const [data, totalCount] = await Promise.all([
    model.findMany({
      ...args,
      skip,
      take: limit,
    }),
    model.count({
      where: args.where,
    }),
  ]);
  const totalPages = Math.ceil(totalCount / limit);
  return {
    data,
    currentPage: page,
    pageCount: data.length,
    totalCount,
    totalPages,
  };
}
