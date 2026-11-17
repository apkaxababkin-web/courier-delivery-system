import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getMessaging, type Message } from "firebase-admin/messaging";
import { readFileSync } from "node:fs";

export type FcmSendResult =
  | { ok: true; invalidToken: false }
  | { ok: false; invalidToken: boolean; errorCode: string };

let firebaseApp: App | undefined;

function getFirebaseApp(): App {
  if (firebaseApp) return firebaseApp;

  const existing = getApps().find(app => app.name === "mig-courier");
  if (existing) {
    firebaseApp = existing;
    return existing;
  }

  const keyPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (!keyPath) {
    throw new Error("FIREBASE_SERVICE_ACCOUNT_PATH is not configured");
  }

  const credentials = JSON.parse(readFileSync(keyPath, "utf8"));

  if (credentials.project_id !== "mig-courier") {
    throw new Error("Firebase project mismatch");
  }

  firebaseApp = initializeApp(
    {
      credential: cert(credentials),
      projectId: "mig-courier",
    },
    "mig-courier",
  );

  return firebaseApp;
}

export async function sendFcmPush(
  token: string,
  title: string,
  body: string,
  data: Record<string, unknown> = {},
): Promise<FcmSendResult> {
  if (!token || typeof token !== "string") {
    return {
      ok: false,
      invalidToken: true,
      errorCode: "invalid-token",
    };
  }

  const normalizedData: Record<string, string> = {};

  for (const [key, value] of Object.entries(data)) {
    if (value === null || value === undefined) continue;
    normalizedData[key] =
      typeof value === "string" ? value : JSON.stringify(value);
  }

  const message: Message = {
    token,
    notification: {
      title,
      body,
    },
    data: normalizedData,
    android: {
      priority: "high",
      notification: {
        channelId: "mig_notifications",
        sound: "default",
      },
    },
  };

  try {
    const app = getFirebaseApp();
    await getMessaging(app).send(message);

    console.log("[FCM] message accepted");

    return {
      ok: true,
      invalidToken: false,
    };
  } catch (error: unknown) {
    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : "unknown";

    const invalidToken =
      code === "messaging/registration-token-not-registered" ||
      code === "messaging/invalid-registration-token";

    console.error("[FCM] send failed", {
      code,
      invalidToken,
    });

    return {
      ok: false,
      invalidToken,
      errorCode: code,
    };
  }
}
