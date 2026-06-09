# TODO for Codex

## Priority 1 — stability
- Run full project audit from AGENTS.md.
- Fix TypeScript/build errors.
- Verify API starts in Docker.
- Verify courier web opens.
- Verify manager site opens.
- Verify request creation creates both requests and tasks.
- Verify task appears on correct Asia/Irkutsk date.

## Priority 2 — request flow
- New request on manager site must appear in courier web/app.
- Deleting a request must delete linked courier task.
- Assigning courier must sync requests/tasks.
- Status changes must sync requests/tasks.
- Remove visible [request:id] from courier UI.

## Priority 3 — courier UI
- Improve request card layout.
- Fix dark theme.
- Fix safe area / white top strip on web/mobile.
- Improve Hemotest and Sberbank screens.
- Add vibration setting.

## Priority 4 — notifications
- New request push to all active couriers.
- New Hemotest list/point push to all couriers.
- New Sberbank list/point push to all couriers.
- Keep assigned-courier push working.

## Priority 5 — release
- Build courier web and deploy to /var/www/courier-app.
- Build manager web and deploy to /var/www/courier-manager.
- Build APK.
