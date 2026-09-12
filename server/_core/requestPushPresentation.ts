import type { Request } from "../../drizzle/schema";

export type RequestPushInput = Partial<Request> & {
  id?: number;
};

function compact(value: unknown) {
  return String(value ?? "").trim();
}

function truncatePushText(value: string, max = 90) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function isToTransportCompany(request: RequestPushInput) {
  return compact(request.comments).includes("получатель → ТК");
}

export function buildRequestPush(
  request: RequestPushInput,
  assigned = false,
) {
  const type = request.requestType;

  let title = "Заявка";
  let body = "";

  if (type === "delivery") {
    const name = compact(
      request.packageDescription ||
      request.recipientCompany ||
      request.recipientName
    );

    title = name ? `Доставка · ${name}` : "Доставка";

    const from = compact(request.senderAddress);
    const to = compact(request.deliveryAddress || request.recipientAddress);

    body = [from, to].filter(Boolean).join(" → ");
  }

  if (type === "movement") {
    const name = compact(request.packageDescription);

    title = name ? `Перемещение · ${name}` : "Перемещение";

    const from = compact(request.senderAddress);
    const to = compact(request.deliveryAddress || request.recipientAddress);

    body = [from, to].filter(Boolean).join(" → ");
  }

  if (type === "courier_call") {
    const senderCompany = compact(request.senderCompany);

    title = senderCompany
      ? `ВК · ${senderCompany}`
      : "ВК";

    body = compact(request.senderAddress);
  }

  if (type === "pickup_from_tc") {
    const tcName = compact(request.tcName);
    const clientName = compact(request.packageDescription);
    const toTc = isToTransportCompany(request);

    title = "ТК";

    const clientAddress = toTc
      ? compact(request.senderAddress)
      : compact(request.deliveryAddress || request.recipientAddress);

    const names = [tcName, clientName]
      .filter(Boolean)
      .join(" · ");

    body = [names, clientAddress]
      .filter(Boolean)
      .join("\n");

    if (!body) {
      body = "Откройте заявку в приложении";
    }
  }

  if (type === "nuts") {
    const recipient = compact(request.recipientName);

    title = recipient
      ? `Орехи · ${recipient}`
      : "Орехи";

    const address = compact(
      request.deliveryAddress || request.recipientAddress
    );
    const items = compact(request.items);

    body = [address, items].filter(Boolean).join(" · ");
  }

  if (type === "simple") {
    const name = compact(
      request.packageDescription || request.senderName
    );

    title = name
      ? `Заявка · ${name}`
      : "Заявка";

    const from = compact(request.senderAddress);
    const to = compact(
      request.deliveryAddress || request.recipientAddress
    );

    body = [from, to].filter(Boolean).join(" → ");
  }

  if (assigned) {
    title = `Назначена вам · ${title}`;
  }

  return {
    title: truncatePushText(title, 90),
    body: truncatePushText(
      body || "Откройте заявку в приложении",
      120,
    ),
  };
}

export function buildNewRequestPush(request: RequestPushInput) {
  return buildRequestPush(request, false);
}

export function buildAssignedRequestPush(request: RequestPushInput) {
  return buildRequestPush(request, true);
}
