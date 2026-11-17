export function isExpoPushToken(pushToken: string | null | undefined) {
  return Boolean(
    pushToken &&
      (pushToken.startsWith("ExponentPushToken") || pushToken.startsWith("ExpoPushToken")),
  );
}

export async function sendExpoPush(
  pushToken: string | null | undefined,
  title: string,
  body: string,
  data?: Record<string, unknown>,
) {
  if (!isExpoPushToken(pushToken)) {
    console.warn("[PUSH] invalid or missing Expo push token");
    return false;
  }

  const token = pushToken as string;

  const payload = {
    to: token,
    sound: "default",
    priority: "high",
    title,
    body,
    data: data ?? {},
  };

  // Do not log recipient tokens or notification contents (may contain private data).
  console.log("[PUSH] expo request queued");

  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text().catch(() => "");
  console.log("[PUSH] expo HTTP status", response.status);

  if (!response.ok) {
    throw new Error(`Expo push HTTP failure: ${response.status}`);
  }

  try {
    const parsed = JSON.parse(text);
    const item = Array.isArray(parsed?.data) ? parsed.data[0] : parsed?.data;
    if (parsed?.errors?.length || !item || item.status !== "ok") {
      const code = item?.details?.error ?? parsed?.errors?.[0]?.code ?? "unknown";
      throw new Error(`Expo push ticket rejected: ${code}`);
    }
    // Ticket acceptance is not device delivery; inspect push receipts separately.
    console.log("[PUSH] expo ticket accepted", item.id ?? "no-ticket-id");
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new Error("Expo push response is not valid JSON");
    } else {
      throw e;
    }
  }

  return true;
}
