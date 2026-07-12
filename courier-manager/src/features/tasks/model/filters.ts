import type { Request, StatusFilter } from './types';
import { toLocalDateKey } from '../../../lib/local-time';

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
      const effectiveDate = request.status === 'completed'
        ? (request.completedAt || request.scheduledAt || request.createdAt)
        : (request.scheduledAt || request.createdAt);

      const requestDate = toLocalDateKey(effectiveDate);

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
