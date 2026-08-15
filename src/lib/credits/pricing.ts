import { prisma } from "@/lib/prisma";

export async function getCreditPerSecond(
  resolution: string,
  hasVideoInput: boolean,
  provider = "dreamina"
) {
  const rule = await prisma.pricingRule.findUnique({
    where: {
      provider_resolution_hasVideoInput: { provider, resolution, hasVideoInput },
    },
  });
  if (!rule || !rule.isActive) {
    throw new Error(
      `単価が設定されていません: provider=${provider} resolution=${resolution} hasVideoInput=${hasVideoInput}`
    );
  }
  return rule.creditPerSecond;
}

export async function calculateCost(params: {
  resolution: string;
  durationSeconds: number;
  hasVideoInput: boolean;
  provider?: string;
}) {
  const creditPerSecond = await getCreditPerSecond(
    params.resolution,
    params.hasVideoInput,
    params.provider
  );
  return Math.ceil(params.durationSeconds * creditPerSecond);
}
