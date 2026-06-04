/**
 * ComfyUI and generation provider types
 */

export interface ComfyUIWorkflow {
  readonly id: string;
  readonly name: string;
  readonly category: "image" | "video" | "audio" | "upscaling" | "enhancement";
  readonly schema: Record<string, unknown>;
  readonly description?: string;
  readonly inputs?: Record<string, unknown>;
  readonly outputs?: Record<string, unknown>;
  readonly tags?: string[];
}

export interface WorkflowInput {
  readonly nodeId: string;
  readonly fieldName: string;
  readonly value: unknown;
  readonly type?: string;
}

export interface WorkflowExecution {
  readonly workflowId: string;
  readonly inputs: WorkflowInput[];
  readonly priority?: number;
}

export interface GenerationProgress {
  readonly nodeId: string;
  readonly nodeType: string;
  readonly progress: number;
  readonly value?: number;
  readonly max?: number;
}

export interface GenerationResult {
  readonly success: boolean;
  readonly outputs: Record<string, unknown>;
  readonly executionTime?: number;
  readonly error?: string;
}

export interface ImageGenerationRequest {
  readonly prompt: string;
  readonly negativePrompt?: string;
  readonly model: string; // flux, sdxl, qwen-image, etc.
  readonly width?: number;
  readonly height?: number;
  readonly steps?: number;
  readonly cfg?: number;
  readonly seed?: number;
  readonly sampler?: string;
  readonly scheduler?: string;
}

export interface VideoGenerationRequest {
  readonly prompt: string;
  readonly model: string; // wan, ltx, hunyuan, cosmos, veo
  readonly width?: number;
  readonly height?: number;
  readonly frames?: number;
  readonly fps?: number;
  readonly duration?: number;
  readonly seed?: number;
}

export interface ImageEditRequest {
  readonly image: string; // base64 or URL
  readonly mask?: string; // base64 or URL for inpainting/outpainting
  readonly prompt: string;
  readonly negativePrompt?: string;
  readonly mode: "inpaint" | "outpaint" | "img2img";
  readonly strength?: number; // 0-1 for img2img
  readonly steps?: number;
  readonly cfg?: number;
}

export interface UpscalingRequest {
  readonly image: string; // base64 or URL
  readonly model: "esrgan" | "realsr" | "upscayl"; // upscaling model
  readonly scale: 2 | 4 | 8; // upscaling factor
  readonly faceRestore?: boolean;
  readonly tileSize?: number; // for large images
}

export interface BackgroundRemovalRequest {
  readonly image: string;
  readonly model: "rmbg" | "birefnet";
  readonly threshold?: number;
}
