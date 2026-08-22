"use client";

import { useCallback, useEffect, useState } from "react";
import { CreditGrantForm } from "./CreditGrantForm";
import { CreditHistoryTable } from "./CreditHistoryTable";
import { ImpersonateButton } from "./ImpersonateButton";
import { GenerationLimitsForm } from "./GenerationLimitsForm";

interface Staff {
  id: string;
  email: string;
  name: string | null;
  isActive: boolean;
  creditBalance: number;
  allowedResolutions: string[];
  minDurationSeconds: number;
  maxDurationSeconds: number;
  allowedAspectRatios: string[];
  allowedGenerationModes: string[];
}

export function StaffDetail({ staffId }: { staffId: string }) {
  const [staff, setStaff] = useState<Staff | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/staff/${staffId}`);
    setStaff(await res.json());
  }, [staffId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!staff) return <p className="text-sm text-neutral-500">読み込み中...</p>;

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between rounded-lg border border-neutral-800 p-6">
        <div>
          <p className="text-lg font-medium">{staff.name ?? staff.email}</p>
          <p className="text-sm text-neutral-500">{staff.email}</p>
        </div>
        <div className="text-right">
          <p className="text-xs text-neutral-500">クレジット残高</p>
          <p className="text-2xl font-semibold">¥{staff.creditBalance.toLocaleString()}</p>
        </div>
        <ImpersonateButton staffId={staff.id} />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-neutral-300">クレジット付与</h2>
        <CreditGrantForm
          staffId={staff.id}
          onGranted={() => {
            setReloadKey((k) => k + 1);
            load();
          }}
        />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-neutral-300">クレジット履歴</h2>
        <CreditHistoryTable staffId={staff.id} reloadKey={reloadKey} />
      </div>

      <div>
        <h2 className="mb-3 text-sm font-medium text-neutral-300">生成設定の制限</h2>
        <GenerationLimitsForm
          staffId={staff.id}
          allowedResolutions={staff.allowedResolutions}
          minDurationSeconds={staff.minDurationSeconds}
          maxDurationSeconds={staff.maxDurationSeconds}
          allowedAspectRatios={staff.allowedAspectRatios}
          allowedGenerationModes={staff.allowedGenerationModes}
          onSaved={load}
        />
      </div>
    </div>
  );
}
