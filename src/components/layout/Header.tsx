import Link from "next/link";
import { AccountMenu } from "./AccountMenu";
import type { Session } from "next-auth";

export function Header({ session }: { session: Session }) {
  return (
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
  );
}
