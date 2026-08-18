export interface ReferenceImage {
  /** プロンプト内で参照する際のタグ (例: "@image1") */
  tag: string;
  url: string;
}

export interface ReferenceVideo {
  /** プロンプト内で参照する際のタグ (例: "@video1") */
  tag: string;
  url: string;
}

export interface VideoGenerationRequest {
  prompt: string;
  referenceImages: ReferenceImage[];
  referenceVideos: ReferenceVideo[];
  endFrameImageUrl?: string;
  resolution: string;
  durationSeconds: number;
  aspectRatio: string;
  generateAudio: boolean;
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
  usage?: { completionTokens: number; totalTokens: number };
}

export interface VideoGenerationProvider {
  readonly name: string;
  submit(req: VideoGenerationRequest): Promise<VideoGenerationSubmitResult>;
  getStatus(providerJobId: string): Promise<VideoGenerationStatusResult>;
}
