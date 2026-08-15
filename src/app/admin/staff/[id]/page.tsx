import { StaffDetail } from "@/components/admin/StaffDetail";

export default function StaffDetailPage({ params }: { params: { id: string } }) {
  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="text-xl font-semibold">スタッフ詳細</h1>
      <div className="mt-6">
        <StaffDetail staffId={params.id} />
      </div>
    </div>
  );
}
