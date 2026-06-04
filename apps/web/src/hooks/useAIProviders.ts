/**
 * Hook — useAIProviders
 *
 * Provides easy access to AI providers configured in settings.
 * Automatically creates provider instances with current settings.
 */

import { useMemo } from "react";
import { useSettingsStore } from "../stores/settings-store";
import { OllamaProvider, OllamaVisionProvider } from "../services/ai/providers";
import { WhisperXProvider } from "../services/transcription";
import { AutoCutService } from "../services/transcription";

export function useAIProviders() {
  const settings = useSettingsStore();

  // Memoize provider instances — recreate only when settings change
  const ollama = useMemo(
    () =>
      new OllamaProvider({
        host: settings.ollamaHost,
        model: settings.ollamaModel,
      }),
    [settings.ollamaHost, settings.ollamaModel],
  );

  const ollamaVision = useMemo(
    () =>
      new OllamaVisionProvider(settings.ollamaHost, settings.ollamaVisionModel),
    [settings.ollamaHost, settings.ollamaVisionModel],
  );

  const whisperx = useMemo(
    () =>
      new WhisperXProvider({
        baseUrl: settings.whisperxBaseUrl,
        model: settings.whisperxModel,
        language: settings.whisperxLanguage,
        enableVad: settings.whisperxEnableVad,
        minSilenceMs: settings.whisperxMinSilenceMs,
        vadThreshold: settings.whisperxVadThreshold,
        paddingMs: settings.whisperxPaddingMs,
      }),
    [
      settings.whisperxBaseUrl,
      settings.whisperxModel,
      settings.whisperxLanguage,
      settings.whisperxEnableVad,
      settings.whisperxMinSilenceMs,
      settings.whisperxVadThreshold,
      settings.whisperxPaddingMs,
    ],
  );

  const autoCut = useMemo(
    () =>
      new AutoCutService({
        baseUrl: settings.whisperxBaseUrl,
        model: settings.whisperxModel,
      }),
    [settings.whisperxBaseUrl, settings.whisperxModel],
  );

  return {
    ollama,
    ollamaVision,
    whisperx,
    autoCut,
  };
}

/**
 * Hook — useOllama
 *
 * Access Ollama chat provider with current settings
 */
export function useOllama() {
  return useAIProviders().ollama;
}

/**
 * Hook — useOllamaVision
 *
 * Access Ollama Vision provider with current settings
 */
export function useOllamaVision() {
  return useAIProviders().ollamaVision;
}

/**
 * Hook — useWhisperX
 *
 * Access WhisperX transcription provider with current settings
 */
export function useWhisperX() {
  return useAIProviders().whisperx;
}

/**
 * Hook — useAutoCut
 *
 * Access auto-cut service with current settings
 */
export function useAutoCut() {
  return useAIProviders().autoCut;
}
