/**
 * ComfyUI Provider — local generative AI via ComfyUI
 *
 * Executes workflows for:
 * - Image generation (Flux, SDXL, Qwen-Image)
 * - Video generation (Wan, LTX, Hunyuan, Cosmos, Veo)
 * - Image editing (inpainting, outpainting, img2img)
 * - Upscaling (ESRGAN, RealSR)
 * - Audio/video enhancement
 */

import type {
  AIProvider,
  ProviderCapabilities,
} from "../../ai/providers/types";
import { ProviderError } from "../../ai/providers/types";
import type {
  GenerationProgress,
  GenerationResult,
  ImageGenerationRequest,
  VideoGenerationRequest,
  ImageEditRequest,
  UpscalingRequest,
  BackgroundRemovalRequest,
} from "./types";
import { workflowRegistry } from "./WorkflowRegistry";

const DEFAULT_HOST = "http://localhost:8188";
const POLL_INTERVAL = 500; // ms
const MAX_POLL_TIME = 3600000; // 1 hour

export class ComfyUIProvider implements AIProvider {
  readonly id = "comfyui";
  readonly name = "ComfyUI";
  readonly capabilities: ProviderCapabilities = {
    imageGeneration: true,
    imageEditing: true,
    videoGeneration: true,
    videoEditing: true,
    audioGeneration: true,
    upscaling: true,
  };

  private host: string;
  private clientId: string;

  constructor(host?: string) {
    this.host = host || DEFAULT_HOST;
    this.clientId = this.generateClientId();
    workflowRegistry.setHost(this.host);
  }

  private generateClientId(): string {
    return `openreel-${Math.random().toString(36).slice(2, 11)}`;
  }

  setHost(host: string): void {
    this.host = host;
    workflowRegistry.setHost(host);
  }

  /**
   * Execute a workflow by ID with given inputs
   */
  async executeWorkflow(
    workflowId: string,
    inputs: Record<string, unknown>,
    progressCallback?: (progress: GenerationProgress) => void,
  ): Promise<GenerationResult> {
    const workflow = workflowRegistry.get(workflowId);
    if (!workflow) {
      throw new ProviderError(
        "comfyui",
        "WORKFLOW_NOT_FOUND",
        `Workflow "${workflowId}" not registered`,
      );
    }

    try {
      // Build execution payload
      const payload = this.buildWorkflowPayload(workflow.schema, inputs);

      // Queue the workflow
      const queueResponse = await this.queueWorkflow(payload);
      const executionId = queueResponse.prompt_id;

      // Poll for completion
      const result = await this.pollExecution(
        executionId,
        progressCallback,
      );

      return result;
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(
        "comfyui",
        "EXECUTION_FAILED",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  /**
   * Generate image from prompt
   */
  async generateImage(
    request: ImageGenerationRequest,
  ): Promise<GenerationResult> {
    const modelMap: Record<string, string> = {
      flux: "flux-image-workflow",
      sdxl: "sdxl-image-workflow",
      "qwen-image": "qwen-image-workflow",
    };

    const workflowId = modelMap[request.model];
    if (!workflowId) {
      throw new ProviderError(
        "comfyui",
        "UNKNOWN_MODEL",
        `Unknown image model: ${request.model}`,
      );
    }

    const inputs = {
      positive: request.prompt,
      negative: request.negativePrompt || "",
      width: request.width || 768,
      height: request.height || 768,
      steps: request.steps || 20,
      cfg: request.cfg || 7.5,
      seed: request.seed || -1,
      sampler_name: request.sampler || "euler",
      scheduler: request.scheduler || "normal",
    };

    return this.executeWorkflow(workflowId, inputs);
  }

  /**
   * Generate video from prompt
   */
  async generateVideo(
    request: VideoGenerationRequest,
  ): Promise<GenerationResult> {
    const modelMap: Record<string, string> = {
      wan: "wan-video-workflow",
      ltx: "ltx-video-workflow",
      hunyuan: "hunyuan-video-workflow",
      cosmos: "cosmos-video-workflow",
      veo: "veo-video-workflow",
    };

    const workflowId = modelMap[request.model];
    if (!workflowId) {
      throw new ProviderError(
        "comfyui",
        "UNKNOWN_MODEL",
        `Unknown video model: ${request.model}`,
      );
    }

    const inputs = {
      prompt: request.prompt,
      width: request.width || 1280,
      height: request.height || 720,
      frames: request.frames || 120,
      fps: request.fps || 24,
      duration: request.duration || 5,
      seed: request.seed || -1,
    };

    return this.executeWorkflow(workflowId, inputs);
  }

  /**
   * Edit image (inpaint, outpaint, img2img)
   */
  async editImage(request: ImageEditRequest): Promise<GenerationResult> {
    const modeMap: Record<string, string> = {
      inpaint: "inpaint-workflow",
      outpaint: "outpaint-workflow",
      img2img: "img2img-workflow",
    };

    const workflowId = modeMap[request.mode];
    if (!workflowId) {
      throw new ProviderError(
        "comfyui",
        "UNKNOWN_MODE",
        `Unknown edit mode: ${request.mode}`,
      );
    }

    const inputs = {
      image: request.image,
      mask: request.mask || null,
      prompt: request.prompt,
      negative_prompt: request.negativePrompt || "",
      strength: request.strength || 0.75,
      steps: request.steps || 20,
      cfg: request.cfg || 7.5,
    };

    return this.executeWorkflow(workflowId, inputs);
  }

  /**
   * Upscale image
   */
  async upscaleImage(request: UpscalingRequest): Promise<GenerationResult> {
    const inputs = {
      image: request.image,
      model: request.model,
      scale_factor: request.scale,
      face_restore: request.faceRestore || false,
      tile_size: request.tileSize || 512,
    };

    return this.executeWorkflow("upscale-workflow", inputs);
  }

  /**
   * Remove background from image
   */
  async removeBackground(
    request: BackgroundRemovalRequest,
  ): Promise<GenerationResult> {
    const inputs = {
      image: request.image,
      model: request.model,
      threshold: request.threshold || 0.5,
    };

    return this.executeWorkflow("background-removal-workflow", inputs);
  }

  /**
   * Queue workflow for execution
   */
  private async queueWorkflow(
    payload: Record<string, unknown>,
  ): Promise<{ prompt_id: string }> {
    const res = await fetch(`${this.host}/prompt`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt: payload,
        client_id: this.clientId,
      }),
    });

    if (!res.ok) {
      throw new ProviderError(
        "comfyui",
        "QUEUE_FAILED",
        `${res.status} ${res.statusText}`,
      );
    }

    const data = (await res.json()) as { prompt_id: string };
    return data;
  }

  /**
   * Poll for execution completion
   */
  private async pollExecution(
    executionId: string,
    progressCallback?: (progress: GenerationProgress) => void,
  ): Promise<GenerationResult> {
    const startTime = Date.now();

    while (true) {
      const elapsed = Date.now() - startTime;
      if (elapsed > MAX_POLL_TIME) {
        throw new ProviderError(
          "comfyui",
          "TIMEOUT",
          `Execution ${executionId} timed out after ${elapsed}ms`,
        );
      }

      try {
        // Get history
        const historyRes = await fetch(
          `${this.host}/history/${executionId}`,
        );

        if (!historyRes.ok) {
          await this.sleep(POLL_INTERVAL);
          continue;
        }

        const history = (await historyRes.json()) as Record<
          string,
          {
            outputs: Record<string, unknown>;
            status: { status_str: string };
          }
        >;

        const execution = history[executionId];
        if (!execution) {
          await this.sleep(POLL_INTERVAL);
          continue;
        }

        // Check if done
        if (
          execution.status.status_str === "success" ||
          execution.status.status_str === "done"
        ) {
          return {
            success: true,
            outputs: execution.outputs,
            executionTime: elapsed,
          };
        }

        if (
          execution.status.status_str === "failed" ||
          execution.status.status_str === "error"
        ) {
          throw new ProviderError(
            "comfyui",
            "EXECUTION_ERROR",
            `Workflow execution failed`,
          );
        }

        // Emit progress
        if (progressCallback && execution.status) {
          progressCallback({
            nodeId: executionId,
            nodeType: "workflow",
            progress: 0.5, // ComfyUI doesn't give granular progress by default
          });
        }
      } catch (err) {
        if (err instanceof ProviderError) throw err;
        console.error("[ComfyUI] Poll error:", err);
      }

      await this.sleep(POLL_INTERVAL);
    }
  }

  /**
   * Build workflow payload from schema and inputs
   */
  private buildWorkflowPayload(
    schema: Record<string, unknown>,
    inputs: Record<string, unknown>,
  ): Record<string, unknown> {
    // Deep clone schema
    const payload = JSON.parse(JSON.stringify(schema)) as Record<
      string,
      Record<string, unknown>
    >;

    // Inject inputs into workflow nodes
    for (const [key, value] of Object.entries(inputs)) {
      for (const nodeId of Object.keys(payload)) {
        const node = payload[nodeId];
        if (node.inputs && typeof node.inputs === "object") {
          const nodeInputs = node.inputs as Record<string, unknown>;
          if (key in nodeInputs) {
            nodeInputs[key] = value;
          }
        }
      }
    }

    return payload;
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.host}/system_stats`);
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * Get system stats
   */
  async getSystemStats(): Promise<Record<string, unknown> | null> {
    try {
      const res = await fetch(`${this.host}/system_stats`);
      if (!res.ok) return null;
      return (await res.json()) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}

export { workflowRegistry };
