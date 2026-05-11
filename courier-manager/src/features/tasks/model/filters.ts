import type { Request, StatusFilter } from './types';

export function getFilteredRequests(
  requests: Request[],
  status: StatusFilter,
  selectedDate: string,
  searchQuery: string
): Request[] {
  const query = searchQuery.trim().toLowerCase();

  return requests.filter((request) => {
    if (status !== 'all' && request.status !== status) {
      return false;
    }

    if (selectedDate) {
      const requestDate = request.createdAt ? request.createdAt.slice(0, 10) : '';
      if (requestDate !== selectedDate) return false;
    }

    if (query) {
      const searchable = [
        request.id,
        request.recipientName,
        request.recipientPhone,
        request.recipientAddress,
        request.recipientCompany,
        request.recipientCity,
        request.deliveryAddress,
        request.deliveryCity,
        request.senderName,
        request.senderPhone,
        request.senderAddress,
        request.senderCompany,
        request.senderCity,
        request.packageDescription,
        request.specialInstructions,
        request.comments,
        request.description,
        request.tcName,
        request.tcAddress,
        request.trackingNumber,
        request.items,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return searchable.includes(query);
    }

    return true;
  });
}
