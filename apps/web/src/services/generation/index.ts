/**
 * Generation Services — central export
 *
 * Image and video generation via ComfyUI
 */

export { ComfyUIProvider, workflowRegistry, WorkflowRegistry } from "./providers";
export type {
  ComfyUIWorkflow,
  WorkflowInput,
  WorkflowExecution,
  GenerationProgress,
  GenerationResult,
  ImageGenerationRequest,
  VideoGenerationRequest,
  ImageEditRequest,
  UpscalingRequest,
  BackgroundRemovalRequest,
} from "./providers";
