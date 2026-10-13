import { Platform } from "react-native";

export const DESIGN_PREVIEW_TOKEN = "__local_design_preview__";

export function isLocalDesignPreviewAvailable() {
  if (Platform.OS !== "web" || typeof window === "undefined") return false;
  return window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
}

export const designPreviewCourier = {
  id: -1,
  name: "Аркадий Бабкин",
  username: "design-preview",
  phone: "+7 999 000-00-00",
  vehicleType: "car",
  isActive: true,
  totalDeliveries: 128,
};

export const designPreviewTasks = [
  {
    id: 201,
    requestId: 201,
    status: "assigned",
    requestType: "simple",
    senderName: "Лаборатория Гемотест",
    senderAddress: "ул. Партизанская, 76",
    recipientName: "Анна Сергеева",
    deliveryAddress: "ул. Бограда, 12, офис 5",
    placesCount: 1,
    courierName: null,
    scheduledAt: new Date(),
    deliveryTimeTo: "12:30",
  },
  {
    id: 202,
    requestId: 202,
    status: "assigned",
    requestType: "delivery",
    senderName: "Hello Korea",
    senderAddress: "ул. Терешковой, 2",
    recipientName: "Анастасия",
    deliveryAddress: "ул. Сахьяновой, 23Б",
    placesCount: 1,
    courierName: "Юрий Бабкин",
    scheduledAt: new Date(),
    deliveryTimeTo: "14:10",
  },
  {
    id: 203,
    requestId: 203,
    status: "in_progress",
    requestType: "movement",
    senderName: "Основа движения ВВЕРХ",
    senderAddress: "ул. Терешковой",
    recipientName: "Дежурный",
    deliveryAddress: "Сосновый Бор, КПП",
    placesCount: 2,
    courierName: "Юрий Бабкин",
    scheduledAt: new Date(),
    deliveryTimeTo: "15:20",
  },
  {
    id: 204,
    requestId: 204,
    status: "assigned",
    requestType: "nuts",
    recipientName: "Магазин Сибирский",
    deliveryAddress: "ул. Ленина, 14",
    items: "Кедровый орех: 4; Фундук: 2; Масло: 6",
    comments: "Сумма: 18400",
    placesCount: 1,
    courierName: null,
    scheduledAt: new Date(),
    deliveryTimeTo: "17:05",
  },
  {
    id: 205,
    requestId: 205,
    status: "assigned",
    requestType: "courier_call",
    senderName: "ИАЦ",
    senderAddress: "ул. Ботаническая, 36, каб. А506",
    recipientName: "Офис",
    deliveryAddress: "ул. Гагарина, 18",
    placesCount: 1,
    courierName: "Аркадий Бабкин",
    scheduledAt: new Date(),
    deliveryTimeTo: "17:00",
    comments: "Забрать документы и печать",
  },
  {
    id: 206,
    requestId: 206,
    status: "assigned",
    requestType: "pickup_from_tc",
    tcName: "Энергия",
    tcAddress: "Терминал Энергия, ул. Гагарина, 18",
    recipientName: "МИГ",
    deliveryAddress: "ул. Ленина, 42",
    comments: "ТК → получатель",
    placesCount: 1,
    courierName: "Аркадий Бабкин",
    scheduledAt: new Date(),
    deliveryTimeTo: "18:20",
  },
  {
    id: 207,
    requestId: 207,
    status: "completed",
    requestType: "pickup_from_tc",
    tcName: "Байкал Сервис",
    tcAddress: "ул. Трактовая, 18",
    recipientName: "Флиппост",
    deliveryAddress: "ул. Байкальская, 206",
    comments: "получатель → ТК",
    placesCount: 2,
    courierName: "Юрий Бабкин",
    scheduledAt: new Date(),
    deliveryTimeTo: "18:50",
  },
] as any[];

export const designPreviewPickupPoints = [
  { id: 1, name: "Biorise", address: "Пестеля, д. 8", phone: null, isPicked: false, pickedAt: null, courierName: null },
  { id: 2, name: "Гемотест", address: "Лермонтова, д. 136", phone: null, isPicked: false, pickedAt: null, courierName: null },
  { id: 3, name: "МедЛаб", address: "Байкальская, д. 202", phone: null, isPicked: true, pickedAt: new Date(), courierName: "Юрий Бабкин" },
];

export const designPreviewMails = [
  { id: 1, waybillNumber: "IRK-24018", recipientName: "Ирина Волкова", recipientPhone: "+7 902 123-45-67", deliveryAddress: "ул. Советская, 58", status: "not_delivered", createdAt: new Date() },
  { id: 2, waybillNumber: "IRK-24017", recipientName: "Алексей Орлов", recipientPhone: "+7 914 555-31-20", deliveryAddress: "мкр. Солнечный, 4", status: "delivered", deliveredAt: new Date(), courierName: "Аркадий Бабкин" },
];
