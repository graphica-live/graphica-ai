import { redirect } from "next/navigation";
import { getEffectiveSession } from "@/lib/auth/effective-session";
import { Header } from "@/components/layout/Header";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getEffectiveSession();
  if (!session?.user) redirect("/login");

  return (
    <div className="min-h-screen">
      <Header session={session} />
      <main>{children}</main>
    </div>
  );
}
