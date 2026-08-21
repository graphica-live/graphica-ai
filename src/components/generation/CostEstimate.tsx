export function CostEstimate({
  cost,
  costPerVideo,
  batchSize,
  balance,
  apiCostEstimateJpy,
}: {
  cost: number | null;
  costPerVideo?: number | null;
  batchSize?: number;
  balance: number | null;
  apiCostEstimateJpy?: number | null;
}) {
  const insufficient = cost !== null && balance !== null && cost > balance;
  const showBreakdown = costPerVideo != null && batchSize != null && batchSize > 1;

  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-neutral-500">消費クレジット</p>
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

      {/* 実際に残高から引かれるのは上の「消費クレジット」(単価×秒数×本数)。
          こちらは生成プロバイダ側の実費概算で、課金額とは一致しない参考値。 */}
      <div className="mt-3 flex items-center justify-between border-t border-neutral-800 pt-2 text-xs text-neutral-500">
        <span>API実費(概算・参考値)</span>
        <span>{apiCostEstimateJpy == null ? "-" : `¥${apiCostEstimateJpy.toFixed(1)}`}</span>
      </div>
    </div>
  );
}
