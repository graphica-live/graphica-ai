export function CostEstimate({
  cost,
  balance,
  loading,
  apiCostEstimateJpy,
}: {
  cost: number | null;
  balance: number | null;
  loading: boolean;
  apiCostEstimateJpy?: number | null;
}) {
  const insufficient = cost !== null && balance !== null && cost > balance;

  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-neutral-500">消費クレジット見込み</p>
          <p className="text-lg font-semibold">
            {loading || cost === null ? "-" : `¥${cost.toLocaleString()}`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-neutral-500">残高</p>
          <p className={`text-lg font-semibold ${insufficient ? "text-red-400" : ""}`}>
            {balance === null ? "-" : `¥${balance.toLocaleString()}`}
          </p>
        </div>
      </div>
      {apiCostEstimateJpy != null && (
        <p className="mt-2 border-t border-neutral-800 pt-2 text-xs text-neutral-500">
          参考: Seedance API実費概算 ¥{apiCostEstimateJpy.toFixed(1)}
        </p>
      )}
    </div>
  );
}
