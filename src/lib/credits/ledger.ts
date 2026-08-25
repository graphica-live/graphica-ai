import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export class InsufficientCreditsError extends Error {}
export class UserNotFoundError extends Error {}

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

/**
 * 管理者がスタッフからクレジットを剥奪する。amount には剥奪額を正の数で渡す。
 *
 * 取引は種別 GRANT のまま amount を負で記録する(残高が減る取引は負、という
 * CONSUMPTION と同じ慣習)。種別を分けない理由は @/lib/credits/adjustment を参照。
 *
 * 生成時の仮押さえと同時に走っても残高がマイナスにならないよう、残高の確認と
 * 減算は createGenerationBatch と同じ条件付き更新1文で原子的に行う。
 */
export async function revokeCredits(
  userId: string,
  actorUserId: string,
  amount: number,
  note?: string
) {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("剥奪額は正の整数である必要があります");
  }

  return prisma.$transaction(async (tx) => {
    const decremented = await tx.user.updateMany({
      where: { id: userId, creditBalance: { gte: amount } },
      data: { creditBalance: { decrement: amount } },
    });
    if (decremented.count === 0) {
      // 0件の原因は「対象が居ない」と「残高不足」の2通りあるので読み直して分ける
      const target = await tx.user.findUnique({
        where: { id: userId },
        select: { creditBalance: true },
      });
      if (!target) throw new UserNotFoundError("対象のスタッフが見つかりません");
      throw new InsufficientCreditsError(
        `残高(¥${target.creditBalance.toLocaleString()})を超える剥奪はできません`
      );
    }

    const user = await tx.user.findUniqueOrThrow({
      where: { id: userId },
      select: { creditBalance: true },
    });
    return tx.creditTransaction.create({
      data: {
        type: "GRANT",
        amount: -amount,
        balanceAfter: user.creditBalance,
        userId,
        actorUserId,
        note,
      },
    });
  });
}
