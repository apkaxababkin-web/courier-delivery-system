# Mobile production checklist

## Scope

Expo React Native courier app only. Backend, API routes and manager web app are not part of this checklist.

## Required pre-build checks

```bash
pnpm install
pnpm mobile:check
```

## Android preview APK

```bash
pnpm mobile:preview:android
```

Use this build for internal courier testing before production distribution.

## Android production build

```bash
pnpm mobile:production:android
```

This produces the production Android build profile configured in `eas.json`.

## iOS production build

```bash
pnpm mobile:production:ios
```

Use this when Apple Developer account and signing are ready.

## Runtime checks after install

1. Login as courier.
2. Close and reopen the app. Session must restore automatically.
3. Turn internet off. Offline banner must appear.
4. Turn internet on. Tasks and mails must refresh automatically.
5. Open `Заявки`. Tasks must load from `https://couriermig.ru`.
6. Open `Письма`. Search, filters and delivery confirmation popup must work.
7. Mark a mail as delivered and enter recipient name.
8. Open `Гемотест`. Pickup points and counter must refresh.
9. Open `Сбербанк`. Pickup points and counter must refresh.
10. Logout. App must return to login screen.

## Production API

Mobile app must use:

```txt
https://couriermig.ru
```

Do not use localhost or old IP addresses in production builds.

## Push notifications

Android notification channel is configured in `app/_layout.tsx`.
Push token registration is guarded so APK builds do not crash when Expo project id is missing.

## Known safe behavior

- If token is broken or expired, app clears local session and redirects to login.
- If network is unavailable, app keeps UI usable and refreshes after reconnect.
- Lifecycle sync runs after app returns from background.
