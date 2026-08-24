"use client";

import { getModelSpec, type VideoModelId } from "@/lib/generation/models";

export function ModelSelect({
  models,
  value,
  onChange,
}: {
  models: readonly VideoModelId[];
  value: VideoModelId;
  onChange: (model: VideoModelId) => void;
}) {
  // 選べるモデルが1つしかないときは、切り替え先が無いのでモデル名だけ示す
  if (models.length <= 1) {
    return (
      <div>
        <p className="mb-2 text-sm font-medium text-neutral-300">モデル</p>
        <p className="text-sm text-neutral-400">{getModelSpec(value).label}</p>
      </div>
    );
  }

  return (
    <div>
      <label htmlFor="model-select" className="mb-2 block text-sm font-medium text-neutral-300">
        モデル
      </label>
      <select
        id="model-select"
        value={value}
        onChange={(e) => onChange(e.target.value as VideoModelId)}
        className="w-full rounded-md border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm sm:w-auto sm:min-w-56"
      >
        {models.map((id) => (
          <option key={id} value={id}>
            {getModelSpec(id).label}
          </option>
        ))}
      </select>
    </div>
  );
}
