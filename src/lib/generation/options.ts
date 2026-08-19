export const RESOLUTIONS = ["480p", "720p", "1080p"] as const;
export const DURATIONS = [5, 10, 15, 20, 30] as const;
export const ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3"] as const;

// 先頭フレーム画像から生成する場合(image to video)、Seedance 2.5は先頭フレームの
// アスペクト比を自動継承し ratio は "adaptive" のみサポートされる。ユーザーが選ぶ値では
// ないため ASPECT_RATIOS には含めない(選択UIと管理画面の許可設定に混入させない)。
export const ADAPTIVE_ASPECT_RATIO = "adaptive";

export type Resolution = (typeof RESOLUTIONS)[number];
export type Duration = (typeof DURATIONS)[number];
export type AspectRatio = (typeof ASPECT_RATIOS)[number];
