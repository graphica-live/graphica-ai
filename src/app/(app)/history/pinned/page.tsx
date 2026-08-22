import { GenerationGrid } from "@/components/history/GenerationGrid";

export default function PinnedHistoryPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-xl font-semibold">ピン止めした生成履歴</h1>
      <div className="mt-6">
        <GenerationGrid pinnedOnly />
      </div>
    </div>
  );
}
