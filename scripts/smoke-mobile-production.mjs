import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const requiredFiles = [
  "app.config.ts",
  "eas.json",
  "constants/oauth.ts",
  "app/(tabs)/letters.tsx",
  "hooks/use-mobile-live-sync.ts",
  "hooks/use-network-status.ts",
  "components/network-banner.tsx",
];

const forbiddenPatterns = [
  /http:\/\/localhost/gi,
  /https?:\/\/127\.0\.0\.1/gi,
  /192\.168\./gi,
  /10\.0\.2\.2/gi,
];

function read(file) {
  return fs.readFileSync(path.join(root, file), "utf8");
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

for (const file of requiredFiles) {
  assert(fs.existsSync(path.join(root, file)), `Missing required mobile file: ${file}`);
}

const filesToScan = [
  "app.config.ts",
  "eas.json",
  "constants/oauth.ts",
  "lib/trpc.ts",
  "app/(tabs)/index.tsx",
  "app/(tabs)/letters.tsx",
  "app/(tabs)/pickup-gemotest.tsx",
  "app/(tabs)/pickup-sberbank.tsx",
  "app/profile.tsx",
];

for (const file of filesToScan) {
  const content = read(file);
  for (const pattern of forbiddenPatterns) {
    assert(!pattern.test(content), `Forbidden dev endpoint found in ${file}: ${pattern}`);
  }
}

const oauth = read("constants/oauth.ts");
assert(oauth.includes("https://couriermig.ru"), "constants/oauth.ts must include production API URL");
assert(oauth.includes("getRealtimeCourierUrl"), "constants/oauth.ts must expose getRealtimeCourierUrl");

const eas = JSON.parse(read("eas.json"));
assert(eas.build?.preview?.android?.buildType === "apk", "eas.json preview profile must build APK");
assert(JSON.stringify(eas).includes("https://couriermig.ru"), "eas.json must include production API URL");

const appConfig = read("app.config.ts");
assert(appConfig.includes("МИГ Курьер"), "app.config.ts must use production app name");
assert(appConfig.includes("mig-courier"), "app.config.ts must use production slug");

const letters = read("app/(tabs)/letters.tsx");
assert(letters.includes("Linking.openURL(`tel:"), "letters screen must open phone dialer");
assert(letters.includes("recipientPhone"), "letters screen must show/search recipient phone");
assert(letters.includes("deliveredAtInput"), "letters screen must include editable delivery date/time input");
assert(letters.includes("deliveredAt,"), "letters screen must send deliveredAt to mail delivery mutation");
assert(letters.includes("parseDateTimeInput"), "letters screen must validate editable delivery date/time");

const serverIndex = read("server/_core/index.ts");
assert(serverIndex.includes("/api/trpc/mails.deliver"), "backend must expose mail delivery override route");
assert(serverIndex.includes("input.deliveredAt"), "backend mail delivery route must accept deliveredAt");
assert(serverIndex.includes("mailId"), "backend mail delivery route must accept mailId");
assert(serverIndex.includes("eq(mails.id, mailId)"), "backend mail delivery route must update by mailId");
assert(serverIndex.includes("deliveredAt,"), "backend mail delivery route must persist deliveredAt");
assert(serverIndex.includes("trpcBatchJson"), "backend mail delivery route must support batched tRPC responses");
assert(serverIndex.includes("isBatch"), "backend mail delivery route must detect batched tRPC bodies");
assert(serverIndex.includes("body?.[0]"), "backend mail delivery route must parse batched tRPC body input");

console.log("✅ Mobile production smoke check passed");
