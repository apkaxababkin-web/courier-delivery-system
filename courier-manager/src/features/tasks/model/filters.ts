import type { Request, StatusFilter } from './types';

export function getFilteredRequests(
  requests: Request[],
  status: StatusFilter,
  dateFrom: string,
  dateTo: string,
  searchQuery: string
): Request[] {
  return requests.filter(request => {
    // Filter by status
    if (status !== 'all' && request.status !== status) {
      return false;
    }

    // Filter by date range
    if (dateFrom || dateTo) {
      const requestDate = new Date(request.createdAt).getTime();
      if (dateFrom) {
        const fromDate = new Date(dateFrom).getTime();
        if (requestDate < fromDate) return false;
      }
      if (dateTo) {
        const toDate = new Date(dateTo).getTime();
        if (requestDate > toDate) return false;
      }
    }

    // Filter by search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        request.recipientName?.toLowerCase().includes(query) ||
        request.deliveryAddress?.toLowerCase().includes(query) ||
        request.senderName?.toLowerCase().includes(query) ||
        request.senderAddress?.toLowerCase().includes(query)
      );
    }

    return true;
  });
}
