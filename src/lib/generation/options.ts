export const RESOLUTIONS = ["480p", "720p", "1080p"] as const;
export const DURATIONS = [5, 10, 15, 20, 30] as const;
export const ASPECT_RATIOS = ["16:9", "9:16", "1:1", "4:3"] as const;

export type Resolution = (typeof RESOLUTIONS)[number];
export type Duration = (typeof DURATIONS)[number];
export type AspectRatio = (typeof ASPECT_RATIOS)[number];
