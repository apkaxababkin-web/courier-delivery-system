export type SafeCourier = {
  id: number;
  userId: number | null;
  name: string;
  username: string;
  phone: string | null;
  displayColor: string;
  displayIcon: string;
  vehicleType: string;
  isActive: boolean;
  totalDeliveries: number;
  /** Completed requests (requests.status = 'completed'), computed on read. */
  completedRequests: number;
  urgencyThresholdOrange: number;
  urgencyThresholdRed: number;
  createdAt: Date;
  updatedAt: Date;
};

export function toSafeCourier(courier: any): SafeCourier {
  return {
    id: courier.id,
    userId: courier.userId ?? null,
    name: courier.name,
    username: courier.username,
    phone: courier.phone ?? null,
    displayColor: courier.displayColor || "#2563EB",
    displayIcon: courier.displayIcon || "UserRound",
    vehicleType: courier.vehicleType,
    isActive: courier.isActive,
    totalDeliveries: courier.totalDeliveries,
    completedRequests: Number.isFinite(Number(courier?.completedRequests)) ? Number(courier.completedRequests) : 0,
    urgencyThresholdOrange: courier.urgencyThresholdOrange,
    urgencyThresholdRed: courier.urgencyThresholdRed,
    createdAt: courier.createdAt,
    updatedAt: courier.updatedAt,
  };
}
