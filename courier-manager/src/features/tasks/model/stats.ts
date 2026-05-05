import type { Request, Statistics } from './types';

export function getStatistics(requests: Request[]): Statistics {
  return {
    total: requests.length,
    pending: requests.filter(r => r.status === 'pending').length,
    assigned: requests.filter(r => r.status === 'assigned').length,
    in_progress: requests.filter(r => r.status === 'in_progress').length,
    completed: requests.filter(r => r.status === 'completed').length,
    cancelled: requests.filter(r => r.status === 'cancelled').length,
  };
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: 'Новая',
    assigned: 'Назначена',
    in_progress: 'В работе',
    completed: 'Завершена',
    cancelled: 'Отменена',
  };
  return labels[status] || status;
}

export function getStatusBadgeClass(status: string): string {
  const classes: Record<string, string> = {
    pending: 'bg-green-100 text-green-800',
    assigned: 'bg-blue-100 text-blue-800',
    in_progress: 'bg-yellow-100 text-yellow-800',
    completed: 'bg-purple-100 text-purple-800',
    cancelled: 'bg-red-100 text-red-800',
  };
  return classes[status] || 'bg-gray-100 text-gray-800';
}

export function getStatusIcon(status: string) {
  const icons: Record<string, string> = {
    pending: '📋',
    assigned: '👤',
    in_progress: '⚙️',
    completed: '✅',
    cancelled: '❌',
  };
  return icons[status] || '•';
}
