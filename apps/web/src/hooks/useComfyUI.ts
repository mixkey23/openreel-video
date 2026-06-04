/**
 * Hook — useComfyUI
 *
 * Access ComfyUI provider with current settings and manage generation state.
 * Provides progress tracking and cancellation support.
 */

import { useState, useCallback, useMemo } from "react";
import { useSettingsStore } from "../stores/settings-store";
import { ComfyUIProvider, workflowRegistry } from "../services/generation/providers";
import type {
  GenerationProgress,
  ImageGenerationRequest,
  VideoGenerationRequest,
  ImageEditRequest,
  UpscalingRequest,
  BackgroundRemovalRequest,
} from "../services/generation/providers";

export interface GenerationState {
  isGenerating: boolean;
  progress: GenerationProgress | null;
  error: string | null;
  result: Record<string, unknown> | null;
}

export function useComfyUI() {
  const settings = useSettingsStore();
  const [state, setState] = useState<GenerationState>({
    isGenerating: false,
    progress: null,
    error: null,
    result: null,
  });

  const provider = useMemo(
    () => new ComfyUIProvider(settings.comfyuiHost),
    [settings.comfyuiHost],
  );

  /**
   * Generate image from prompt
   */
  const generateImage = useCallback(
    async (request: ImageGenerationRequest) => {
      setState({
        isGenerating: true,
        progress: null,
        error: null,
        result: null,
      });

      try {
        const result = await provider.generateImage(request);

        setState({
          isGenerating: false,
          progress: null,
          error: null,
          result: result.outputs,
        });

        return result;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setState({
          isGenerating: false,
          progress: null,
          error: errorMsg,
          result: null,
        });
        throw err;
      }
    },
    [provider],
  );

  /**
   * Generate video from prompt
   */
  const generateVideo = useCallback(
    async (request: VideoGenerationRequest) => {
      setState({
        isGenerating: true,
        progress: null,
        error: null,
        result: null,
      });

      try {
        const result = await provider.generateVideo(request);

        setState({
          isGenerating: false,
          progress: null,
          error: null,
          result: result.outputs,
        });

        return result;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setState({
          isGenerating: false,
          progress: null,
          error: errorMsg,
          result: null,
        });
        throw err;
      }
    },
    [provider],
  );

  /**
   * Edit image (inpaint, outpaint, img2img)
   */
  const editImage = useCallback(
    async (request: ImageEditRequest) => {
      setState({
        isGenerating: true,
        progress: null,
        error: null,
        result: null,
      });

      try {
        const result = await provider.editImage(request);

        setState({
          isGenerating: false,
          progress: null,
          error: null,
          result: result.outputs,
        });

        return result;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setState({
          isGenerating: false,
          progress: null,
          error: errorMsg,
          result: null,
        });
        throw err;
      }
    },
    [provider],
  );

  /**
   * Upscale image
   */
  const upscaleImage = useCallback(
    async (request: UpscalingRequest) => {
      setState({
        isGenerating: true,
        progress: null,
        error: null,
        result: null,
      });

      try {
        const result = await provider.upscaleImage(request);

        setState({
          isGenerating: false,
          progress: null,
          error: null,
          result: result.outputs,
        });

        return result;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setState({
          isGenerating: false,
          progress: null,
          error: errorMsg,
          result: null,
        });
        throw err;
      }
    },
    [provider],
  );

  /**
   * Remove background from image
   */
  const removeBackground = useCallback(
    async (request: BackgroundRemovalRequest) => {
      setState({
        isGenerating: true,
        progress: null,
        error: null,
        result: null,
      });

      try {
        const result = await provider.removeBackground(request);

        setState({
          isGenerating: false,
          progress: null,
          error: null,
          result: result.outputs,
        });

        return result;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setState({
          isGenerating: false,
          progress: null,
          error: errorMsg,
          result: null,
        });
        throw err;
      }
    },
    [provider],
  );

  /**
   * Discover workflows from ComfyUI server
   */
  const discoverWorkflows = useCallback(async () => {
    try {
      const workflows = await workflowRegistry.discoverWorkflows();
      return workflows;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setState((prev) => ({ ...prev, error: errorMsg }));
      throw err;
    }
  }, []);

  /**
   * Get workflows by category
   */
  const getWorkflowsByCategory = useCallback(
    (category: "image" | "video" | "audio" | "upscaling" | "enhancement") => {
      return workflowRegistry.getByCategory(category);
    },
    [],
  );

  /**
   * Health check
   */
  const healthCheck = useCallback(async () => {
    return provider.healthCheck();
  }, [provider]);

  /**
   * Clear state
   */
  const reset = useCallback(() => {
    setState({
      isGenerating: false,
      progress: null,
      error: null,
      result: null,
    });
  }, []);

  return {
    // State
    ...state,

    // Methods
    generateImage,
    generateVideo,
    editImage,
    upscaleImage,
    removeBackground,
    discoverWorkflows,
    getWorkflowsByCategory,
    healthCheck,
    reset,

    // Provider instance
    provider,
  };
}

/**
 * Hook — useWorkflowRegistry
 *
 * Direct access to workflow registry
 */
export function useWorkflowRegistry() {
  return workflowRegistry;
}
