import type { Request, StatusFilter } from './types';

export function getFilteredRequests(
  requests: Request[],
  status: StatusFilter,
  selectedDate: string,
  searchQuery: string
): Request[] {
  return requests.filter((request) => {
    // status
    if (status !== 'all' && request.status !== status) {
      return false;
    }

    // selected day
    if (selectedDate) {
      const requestDate = new Date(request.createdAt)
        .toISOString()
        .slice(0, 10);

      if (requestDate !== selectedDate) {
        return false;
      }
    }

    // search
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
