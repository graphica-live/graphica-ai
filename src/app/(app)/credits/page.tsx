import { getEffectiveSession } from "@/lib/auth/effective-session";
import { prisma } from "@/lib/prisma";
import { CreditTransactionTable } from "@/components/credits/CreditTransactionTable";
import { GenerationLimitsSummary } from "@/components/credits/GenerationLimitsSummary";

export default async function CreditsPage() {
  const session = await getEffectiveSession();
  const userId = session!.user.id;

  const [user, transactions] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        creditBalance: true,
        allowedModels: true,
        allowedResolutions: true,
        minDurationSeconds: true,
        maxDurationSeconds: true,
        allowedAspectRatios: true,
        allowedGenerationModes: true,
      },
    }),
    prisma.creditTransaction.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        type: true,
        amount: true,
        balanceAfter: true,
        note: true,
        createdAt: true,
        actor: { select: { email: true, name: true } },
      },
      take: 100,
    }),
  ]);

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-xl font-semibold">クレジット履歴</h1>

      <div className="mt-6 rounded-lg border border-neutral-800 p-6">
        <p className="text-xs text-neutral-500">クレジット残高</p>
        <p className="mt-1 text-2xl font-semibold">¥{user.creditBalance.toLocaleString()}</p>
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-neutral-300">クレジット履歴</h2>
        <CreditTransactionTable
          transactions={transactions.map((tx) => ({
            ...tx,
            createdAt: tx.createdAt.toISOString(),
          }))}
        />
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-sm font-medium text-neutral-300">生成設定の制限</h2>
        <GenerationLimitsSummary
          allowedModels={user.allowedModels}
          allowedResolutions={user.allowedResolutions}
          minDurationSeconds={user.minDurationSeconds}
          maxDurationSeconds={user.maxDurationSeconds}
          allowedAspectRatios={user.allowedAspectRatios}
          allowedGenerationModes={user.allowedGenerationModes}
        />
      </div>
    </div>
  );
}
