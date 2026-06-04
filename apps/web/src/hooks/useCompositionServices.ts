/**
 * Hook — useCompositionServices
 *
 * Access to high-level video composition services that combine multiple AI providers.
 */

import { useMemo, useState, useCallback } from "react";
import { useSettingsStore } from "../stores/settings-store";
import {
  SmartBrollService,
  AutoStoryboardService,
  AIClipAnalyzerService,
  AutoSocialShortsService,
} from "../services/composition";

export interface CompositionState {
  isProcessing: boolean;
  progress: number;
  error: string | null;
}

export function useCompositionServices() {
  const settings = useSettingsStore();
  const [state, setState] = useState<CompositionState>({
    isProcessing: false,
    progress: 0,
    error: null,
  });

  // Create service instances with current settings
  const services = useMemo(
    () => ({
      smartBroll: new SmartBrollService(
        {
          host: settings.ollamaHost,
          model: settings.ollamaModel,
        },
        settings.comfyuiHost,
      ),
      storyboard: new AutoStoryboardService(
        {
          host: settings.ollamaHost,
          model: settings.ollamaModel,
        },
        settings.comfyuiHost,
      ),
      clipAnalyzer: new AIClipAnalyzerService(
        settings.ollamaHost,
        settings.ollamaVisionModel,
      ),
      socialShorts: new AutoSocialShortsService(
        {
          baseUrl: settings.whisperxBaseUrl,
          model: settings.whisperxModel,
        },
        {
          host: settings.ollamaHost,
          model: settings.ollamaModel,
        },
      ),
    }),
    [
      settings.ollamaHost,
      settings.ollamaModel,
      settings.ollamaVisionModel,
      settings.comfyuiHost,
      settings.whisperxBaseUrl,
      settings.whisperxModel,
    ],
  );

  const setError = useCallback((error: string | null) => {
    setState((prev) => ({ ...prev, error }));
  }, []);

  const setProgress = useCallback((progress: number) => {
    setState((prev) => ({ ...prev, progress }));
  }, []);

  const setIsProcessing = useCallback((isProcessing: boolean) => {
    setState((prev) => ({ ...prev, isProcessing }));
  }, []);

  const reset = useCallback(() => {
    setState({
      isProcessing: false,
      progress: 0,
      error: null,
    });
  }, []);

  return {
    // State
    ...state,

    // Services
    ...services,

    // State setters
    setError,
    setProgress,
    setIsProcessing,
    reset,
  };
}

/**
 * Hook — useSmartBroll
 *
 * Generate intelligent B-roll from transcript
 */
export function useSmartBroll() {
  const { smartBroll, setIsProcessing, setError, setProgress } =
    useCompositionServices();

  const generate = useCallback(
    async (transcript: any, videoContext?: string) => {
      setIsProcessing(true);
      setError(null);
      setProgress(0);

      try {
        const result = await smartBroll.generateBroll({
          transcript,
          videoContext,
        });

        setProgress(100);
        return result;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setError(errorMsg);
        throw err;
      } finally {
        setIsProcessing(false);
      }
    },
    [smartBroll, setIsProcessing, setError, setProgress],
  );

  return { generate, smartBroll };
}

/**
 * Hook — useAutoStoryboard
 *
 * Generate storyboards from scripts
 */
export function useAutoStoryboard() {
  const { storyboard, setIsProcessing, setError, setProgress } =
    useCompositionServices();

  const generate = useCallback(
    async (script: string, videoTitle?: string, targetDuration?: number) => {
      setIsProcessing(true);
      setError(null);
      setProgress(0);

      try {
        const result = await storyboard.generateStoryboard({
          script,
          videoTitle,
          videoDuration: targetDuration,
        });

        setProgress(100);
        return result;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setError(errorMsg);
        throw err;
      } finally {
        setIsProcessing(false);
      }
    },
    [storyboard, setIsProcessing, setError, setProgress],
  );

  return { generate, storyboard };
}

/**
 * Hook — useAIClipAnalyzer
 *
 * Analyze video clips for quality and suggestions
 */
export function useAIClipAnalyzer() {
  const { clipAnalyzer, setIsProcessing, setError, setProgress } =
    useCompositionServices();

  const analyze = useCallback(
    async (clipUrl: string, keyframeCount?: number) => {
      setIsProcessing(true);
      setError(null);
      setProgress(0);

      try {
        const result = await clipAnalyzer.analyzeClip({
          clipUrl,
          keyframeCount,
        });

        setProgress(100);
        return result;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setError(errorMsg);
        throw err;
      } finally {
        setIsProcessing(false);
      }
    },
    [clipAnalyzer, setIsProcessing, setError, setProgress],
  );

  return { analyze, clipAnalyzer };
}

/**
 * Hook — useAutoSocialShorts
 *
 * Generate social media shorts from long-form videos
 */
export function useAutoSocialShorts() {
  const { socialShorts, setIsProcessing, setError, setProgress } =
    useCompositionServices();

  const generate = useCallback(
    async (
      audioFile: File | Blob,
      maxDuration?: number,
      platform?: "tiktok" | "youtube-shorts" | "instagram-reels" | "custom",
    ) => {
      setIsProcessing(true);
      setError(null);
      setProgress(0);

      try {
        const result = await socialShorts.generateShorts({
          videoUrl: "",
          audioFile,
          maxDuration,
          platform,
        });

        setProgress(100);
        return result;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        setError(errorMsg);
        throw err;
      } finally {
        setIsProcessing(false);
      }
    },
    [socialShorts, setIsProcessing, setError, setProgress],
  );

  const optimizeForPlatform = useCallback(
    (
      result: any,
      platform: "tiktok" | "youtube-shorts" | "instagram-reels" | "custom",
    ) => {
      return socialShorts.optimizeForPlatform(result, platform);
    },
    [socialShorts],
  );

  return { generate, optimizeForPlatform, socialShorts };
}
