import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  const user = await prisma.user.findUniqueOrThrow({
    where: { id: session!.user.id },
  });

  return (
    <div className="mx-auto max-w-3xl px-6 py-10">
      <h1 className="text-xl font-semibold">設定</h1>
      <div className="mt-6 space-y-4 rounded-lg border border-neutral-800 p-6">
        <div>
          <p className="text-xs text-neutral-500">名前</p>
          <p className="text-sm">{user.name ?? "-"}</p>
        </div>
        <div>
          <p className="text-xs text-neutral-500">メールアドレス</p>
          <p className="text-sm">{user.email}</p>
        </div>
        <div>
          <p className="text-xs text-neutral-500">クレジット残高</p>
          <p className="text-sm">¥{user.creditBalance.toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}
