import { GenerationGrid } from "@/components/history/GenerationGrid";

export default function HistoryPage() {
  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-xl font-semibold">生成履歴</h1>
      <div className="mt-6">
        <GenerationGrid />
      </div>
    </div>
  );
}
