// Re-export types from api.ts to avoid duplication
export type { Client, Request } from '../../../lib/api';

export interface NutsBox {
  id: string;
  name: string;
  quantity: number;
  price?: number;
}

export interface TaskFormData {
  requestType?: 'delivery' | 'movement' | 'nuts' | 'courier_call' | 'pickup_from_tc' | 'simple';
  requestDate?: string;
  requestFiles?: File[];
  extraPickupPoints?: Array<{
    name: string;
    address: string;
    contactPerson?: string;
    phone?: string;
  }>;
  clientId?: number;
  courierId?: number;
  senderName?: string;
  senderCompany?: string;
  senderCity?: string;
  senderAddress?: string;
  senderPhone?: string;
  recipientName?: string;
  recipientCompany?: string;
  recipientCity?: string;
  recipientPhone?: string;
  recipientAddress?: string;
  deliveryAddress?: string;
  deliveryCity?: string;
  packageDescription?: string;
  packageType?: 'document' | 'small' | 'medium' | 'large' | 'fragile';
  specialInstructions?: string;
  deliveryTimeFrom?: string;
  deliveryTimeTo?: string;
  placesCount?: number;
  comments?: string;
  paymentMethod?: 'paid' | 'transfer' | 'cash' | 'terminal' | 'qr';
  paymentAmount?: number;
  items?: string;
  callReason?: string;
  tcName?: string;
  tcAddress?: string;
  trackingNumber?: string;
  description?: string;
  estimatedMinutes?: number;
}

export interface Statistics {
  total: number;
  pending: number;
  assigned: number;
  in_progress: number;
  completed: number;
  cancelled: number;
}

export type StatusFilter = 'all' | 'pending' | 'assigned' | 'in_progress' | 'completed' | 'cancelled';
