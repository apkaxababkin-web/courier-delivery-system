import { describe, expect, it } from "vitest";
import { maxNotificationText, MAX_NOTIFICATION_DELAY_MS } from "../server/_core/maxDelayedNotifications";

describe("MAX delayed notifications", () => {
  it("uses MAX draft ID instead of internal request ID", () => {
    expect(maxNotificationText(36, "approved"))
      .toBe("✅ Заявка №36 принята в работу.");
    expect(maxNotificationText(36, "rejected"))
      .toBe("❌ Заявка №36 отклонена.");
  });

  it("uses the latest number of places in notification text", () => {
    expect(maxNotificationText(36, "places", 4))
      .toBe("📦 Заявка №36: курьер забрал 4 места.");
  });

  it("declines places correctly", () => {
    const cases: Array<[number, string]> = [
      [1, "место"],
      [2, "места"],
      [4, "места"],
      [5, "мест"],
      [11, "мест"],
      [14, "мест"],
      [21, "место"],
      [22, "места"],
      [25, "мест"],
    ];

    for (const [count, word] of cases) {
      expect(maxNotificationText(36, "places", count))
        .toBe(`📦 Заявка №36: курьер забрал ${count} ${word}.`);
    }
  });

  it("formats final statuses", () => {
    expect(maxNotificationText(36, "completed"))
      .toBe("✅ Заявка №36 выполнена.");
    expect(maxNotificationText(36, "cancelled"))
      .toBe("❌ Заявка №36 отменена.");
  });

  it("uses a five-minute delay", () => {
    expect(MAX_NOTIFICATION_DELAY_MS).toBe(300_000);
  });
});
