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
    console.log("[PUSH] invalid token", pushToken ? `${pushToken.slice(0, 25)}...` : null);
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

  console.log("[PUSH] expo request", {
    to: token.slice(0, 25),
    title,
    body,
    data: data ?? {},
  });

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
  console.log("[PUSH] expo response", response.status, text);

  if (!response.ok) {
    throw new Error(`Expo push failed ${response.status}: ${text}`);
  }

  try {
    const parsed = JSON.parse(text);
    const item = Array.isArray(parsed?.data) ? parsed.data[0] : parsed?.data;
    if (item?.status && item.status !== "ok") {
      throw new Error(`Expo push rejected: ${text}`);
    }
  } catch (e) {
    if (e instanceof SyntaxError) {
      console.log("[PUSH] expo response is not JSON");
    } else {
      throw e;
    }
  }

  return true;
}
