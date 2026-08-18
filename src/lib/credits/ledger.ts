import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export class InsufficientCreditsError extends Error {}

/**
 * 既存トランザクション内でスタッフへクレジットを返還する。
 * ジョブの状態遷移と同一トランザクションにまとめて、
 * 「失敗として記録したのに残高が戻らない」「二重に返還される」を防ぐ用途で使う。
 */
export async function refundCreditsWithin(
  tx: Prisma.TransactionClient,
  userId: string,
  amount: number,
  generationJobId?: string,
  note?: string
) {
  const user = await tx.user.update({
    where: { id: userId },
    data: { creditBalance: { increment: amount } },
  });
  return tx.creditTransaction.create({
    data: {
      type: "REFUND",
      amount,
      balanceAfter: user.creditBalance,
      userId,
      generationJobId,
      note,
    },
  });
}

/** 生成失敗時などにスタッフへクレジットを返還する。 */
export async function refundCredits(
  userId: string,
  amount: number,
  generationJobId?: string,
  note?: string
) {
  return prisma.$transaction((tx) =>
    refundCreditsWithin(tx, userId, amount, generationJobId, note)
  );
}

/** 管理者がスタッフへクレジットを付与する。 */
export async function grantCredits(
  userId: string,
  actorUserId: string,
  amount: number,
  note?: string
) {
  if (amount <= 0) throw new Error("付与額は正の数である必要があります");

  return prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: userId },
      data: { creditBalance: { increment: amount } },
    });
    return tx.creditTransaction.create({
      data: {
        type: "GRANT",
        amount,
        balanceAfter: user.creditBalance,
        userId,
        actorUserId,
        note,
      },
    });
  });
}
