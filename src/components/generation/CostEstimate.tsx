export function CostEstimate({
  cost,
  costPerVideo,
  batchSize,
  balance,
}: {
  cost: number | null;
  costPerVideo?: number | null;
  batchSize?: number;
  balance: number | null;
}) {
  const insufficient = cost !== null && balance !== null && cost > balance;
  const showBreakdown = costPerVideo != null && batchSize != null && batchSize > 1;

  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-neutral-500">概算消費クレジット</p>
          <p className={`text-lg font-semibold ${insufficient ? "text-red-400" : ""}`}>
            {cost === null ? "-" : `¥${cost.toLocaleString()}`}
          </p>
          {showBreakdown && (
            <p className="text-xs text-neutral-500">
              ¥{costPerVideo.toLocaleString()} × {batchSize}本
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-neutral-500">残高</p>
          <p className={`text-lg font-semibold ${insufficient ? "text-red-400" : ""}`}>
            {balance === null ? "-" : `¥${balance.toLocaleString()}`}
          </p>
        </div>
      </div>

      {/* 送信時にこの概算額を仮押さえし、生成完了時に実使用量で差額を精算する。 */}
      <p className="mt-3 border-t border-neutral-800 pt-2 text-xs text-neutral-500">
        生成完了時に実際のAPI使用量で精算されます
      </p>
    </div>
  );
}
