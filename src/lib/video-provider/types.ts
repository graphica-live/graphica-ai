export interface ReferenceImage {
  /** プロンプト内で参照する際のタグ (例: "@image1") */
  tag: string;
  url: string;
}

export interface VideoGenerationRequest {
  prompt: string;
  referenceImages: ReferenceImage[];
  endFrameImageUrl?: string;
  resolution: string;
  durationSeconds: number;
  aspectRatio: string;
}

export interface VideoGenerationSubmitResult {
  providerJobId: string;
}

export type ProviderJobStatus = "pending" | "processing" | "completed" | "failed";

export interface VideoGenerationStatusResult {
  status: ProviderJobStatus;
  progress?: number;
  videoUrl?: string;
  thumbnailUrl?: string;
  errorMessage?: string;
}

export interface VideoGenerationProvider {
  readonly name: string;
  submit(req: VideoGenerationRequest): Promise<VideoGenerationSubmitResult>;
  getStatus(providerJobId: string): Promise<VideoGenerationStatusResult>;
}
