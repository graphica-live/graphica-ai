import Link from "next/link";
import { AccountMenu } from "./AccountMenu";
import type { Session } from "next-auth";

export function Header({ session }: { session: Session }) {
  return (
    <div>
      {session.impersonatedBy && (
        <div className="bg-amber-500 px-6 py-1.5 text-center text-xs font-medium text-amber-950">
          管理者代理操作中（{session.user.name ?? session.user.email}として操作しています）
        </div>
      )}
      <header className="sticky top-0 z-10 flex h-14 items-center justify-between border-b border-neutral-800 bg-neutral-950/80 px-6 backdrop-blur">
        <Link href="/" className="text-sm font-semibold tracking-tight">
          Graphica AI Video
        </Link>
        <AccountMenu
          name={session.user.name}
          email={session.user.email ?? ""}
          image={session.user.image}
          role={session.user.role}
        />
      </header>
    </div>
  );
}
