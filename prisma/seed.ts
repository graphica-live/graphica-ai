import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// seevio.aiの「モデル×解像度×動画入力有無でクレジット/秒が変わる」パターンを参考にした初期単価。
// 実際の値は運用開始後に管理者が調整する想定。
const DEFAULT_PRICING_RULES = [
  { resolution: "480p", hasVideoInput: false, creditPerSecond: 30 },
  { resolution: "480p", hasVideoInput: true, creditPerSecond: 18 },
  { resolution: "720p", hasVideoInput: false, creditPerSecond: 60 },
  { resolution: "720p", hasVideoInput: true, creditPerSecond: 36 },
  { resolution: "1080p", hasVideoInput: false, creditPerSecond: 150 },
  { resolution: "1080p", hasVideoInput: true, creditPerSecond: 100 },
];

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL?.toLowerCase();
  if (!adminEmail) {
    throw new Error("ADMIN_EMAIL is not set");
  }

  await prisma.user.upsert({
    where: { email: adminEmail },
    update: { role: "ADMIN" },
    create: { email: adminEmail, role: "ADMIN" },
  });
  console.log(`[seed] admin ensured: ${adminEmail}`);

  for (const rule of DEFAULT_PRICING_RULES) {
    await prisma.pricingRule.upsert({
      where: {
        provider_resolution_hasVideoInput: {
          provider: "dreamina",
          resolution: rule.resolution,
          hasVideoInput: rule.hasVideoInput,
        },
      },
      update: { creditPerSecond: rule.creditPerSecond },
      create: { provider: "dreamina", ...rule },
    });
  }
  console.log(`[seed] pricing rules ensured: ${DEFAULT_PRICING_RULES.length}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
