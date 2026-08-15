import { prisma } from "@/lib/prisma";

export class InsufficientCreditsError extends Error {}

/** 生成失敗時などにスタッフへクレジットを返還する。 */
export async function refundCredits(
  userId: string,
  amount: number,
  generationJobId?: string,
  note?: string
) {
  return prisma.$transaction(async (tx) => {
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
  });
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
