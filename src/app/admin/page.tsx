import { StaffTable } from "@/components/admin/StaffTable";
import { UsageSummary } from "@/components/admin/UsageSummary";

export default function AdminPage() {
  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-xl font-semibold">管理画面</h1>
      <div className="mt-6">
        <StaffTable />
      </div>
      <div className="mt-10">
        <UsageSummary />
      </div>
    </div>
  );
}
