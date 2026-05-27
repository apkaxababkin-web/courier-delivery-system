export async function sendExpoPush(
  pushToken: string | null | undefined,
  title: string,
  body: string,
  data?: Record<string, unknown>,
) {
  if (!pushToken || !pushToken.startsWith("ExponentPushToken")) return false;

  const response = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip, deflate",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: pushToken,
      sound: "default",
      priority: "high",
      title,
      body,
      data: data ?? {},
    }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Expo push failed ${response.status}: ${text}`);
  }

  return true;
}
