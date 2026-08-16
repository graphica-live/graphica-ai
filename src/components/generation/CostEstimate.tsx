export function CostEstimate({
  cost,
  balance,
  apiCostEstimateJpy,
}: {
  cost: number | null;
  balance: number | null;
  apiCostEstimateJpy?: number | null;
}) {
  const insufficient = cost !== null && balance !== null && cost > balance;

  return (
    <div className="rounded-md border border-neutral-800 bg-neutral-900 px-4 py-3 text-sm">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-neutral-500">概算消費クレジット</p>
          <p className="text-lg font-semibold">
            {apiCostEstimateJpy == null ? "-" : `¥${apiCostEstimateJpy.toFixed(1)}`}
          </p>
        </div>
        <div className="text-right">
          <p className="text-neutral-500">残高</p>
          <p className={`text-lg font-semibold ${insufficient ? "text-red-400" : ""}`}>
            {balance === null ? "-" : `¥${balance.toLocaleString()}`}
          </p>
        </div>
      </div>
    </div>
  );
}
