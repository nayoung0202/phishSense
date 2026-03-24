export function getTotalPages(totalItems: number, pageSize: number) {
  return Math.max(1, Math.ceil(totalItems / pageSize));
}

export function clampPage(page: number, totalPages: number) {
  return Math.min(Math.max(1, page), Math.max(1, totalPages));
}

export function paginateItems<T>(items: T[], page: number, pageSize: number) {
  const total = items.length;
  const totalPages = getTotalPages(total, pageSize);
  const safePage = clampPage(page, totalPages);
  const start = (safePage - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize),
    total,
    totalPages,
    page: safePage,
  };
}
