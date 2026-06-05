import { create } from "zustand";
import { subscribeWithSelector, persist } from "zustand/middleware";
import { onSessionLock } from "../services/secure-storage";

export interface ServiceConfig {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly docsUrl?: string;
}

/**
 * Registry of supported external services that require API keys.
 * Add new services here as the app integrates more third-party APIs.
 *
 * Local providers (ollama, whisperx) do NOT require API keys — configuration only.
 */
export const SERVICE_REGISTRY: readonly ServiceConfig[] = [
  {
    id: "elevenlabs",
    label: "ElevenLabs",
    description: "AI voice generation and text-to-speech",
    docsUrl: "https://elevenlabs.io/docs/api-reference",
  },
  {
    id: "openai",
    label: "OpenAI",
    description: "GPT models for script generation and AI features",
    docsUrl: "https://platform.openai.com/docs/api-reference",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    description: "Claude models for AI-assisted editing",
    docsUrl: "https://docs.anthropic.com/en/docs",
  },
  {
    id: "kie-ai",
    label: "Kie.ai",
    description: "AI aggregator for video/image generation, upscaling, and editing",
    docsUrl: "https://kie.ai",
  },
  {
    id: "freepik",
    label: "Freepik",
    description: "AI aggregator for image generation, vectors, and creative assets",
    docsUrl: "https://www.freepik.com/api",
  },
  {
    id: "ollama",
    label: "Ollama",
    description: "Local LLM via Ollama (no API key required)",
    docsUrl: "https://ollama.ai",
  },
  {
    id: "whisperx",
    label: "WhisperX",
    description: "Local transcription with word-level timestamps (no API key required)",
    docsUrl: "https://github.com/m-bain/whisperX",
  },
] as const;

export type TtsProvider = "piper" | "elevenlabs";
export type LlmProvider = "openai" | "anthropic" | "ollama";
export type TranscriptionProvider = "whisperx";
export type AggregatorProvider = "kie-ai" | "freepik";
export type SettingsTab = "general" | "api-keys" | "local-providers";

export interface SettingsState {
  // General preferences
  autoSave: boolean;
  autoSaveInterval: number;
  language: string;

  // AI/Service preferences
  defaultTtsProvider: TtsProvider;
  defaultLlmProvider: LlmProvider;
  defaultTranscriptionProvider: TranscriptionProvider;
  defaultAggregator: AggregatorProvider;
  elevenLabsModel: string;
  favoriteVoices: Array<{ voiceId: string; name: string; previewUrl?: string }>;
  favoriteModels: Array<{ modelId: string; name: string }>;
  configuredServices: string[]; // IDs of services with stored API keys

  // Local provider configuration (Ollama, WhisperX)
  ollamaHost: string;
  ollamaModel: string;
  ollamaVisionModel: string;
  whisperxBaseUrl: string;
  whisperxModel: "large-v3" | "large-v3-turbo" | "medium" | "small";
  whisperxLanguage: string;
  whisperxEnableVad: boolean;
  whisperxEnableDiarization: boolean;
  whisperxMinSilenceMs: number;
  whisperxVadThreshold: number;
  whisperxPaddingMs: number;

  // Auto-cut configuration
  autoCutMinSegmentDuration: number;
  autoCutUseSpeakerChanges: boolean;
  autoCutUseSilences: boolean;

  // ComfyUI configuration
  comfyuiHost: string;
  comfyuiDefaultImageModel: string; // flux, sdxl, qwen-image
  comfyuiDefaultVideoModel: string; // wan, ltx, hunyuan, cosmos, veo
  comfyuiAutoDiscovery: boolean;

  // Session-scoped API caches (cleared on session lock, not persisted)
  cachedElevenLabsVoices: Array<{ voice_id: string; name: string; category: string; labels: Record<string, string>; preview_url?: string }> | null;
  cachedElevenLabsModels: Array<{ model_id: string; name: string; description?: string; can_do_text_to_speech?: boolean; languages?: Array<{ language_id: string; name: string }> }> | null;

  // Settings dialog state
  settingsOpen: boolean;
  settingsTab: SettingsTab;

  // Actions
  setAutoSave: (enabled: boolean) => void;
  setAutoSaveInterval: (minutes: number) => void;
  setLanguage: (lang: string) => void;
  setDefaultTtsProvider: (provider: TtsProvider) => void;
  setDefaultLlmProvider: (provider: LlmProvider) => void;
  setDefaultTranscriptionProvider: (provider: TranscriptionProvider) => void;
  setDefaultAggregator: (provider: AggregatorProvider) => void;
  setElevenLabsModel: (model: string) => void;
  addFavoriteVoice: (voice: { voiceId: string; name: string; previewUrl?: string }) => void;
  removeFavoriteVoice: (voiceId: string) => void;
  addFavoriteModel: (model: { modelId: string; name: string }) => void;
  removeFavoriteModel: (modelId: string) => void;
  addConfiguredService: (serviceId: string) => void;
  removeConfiguredService: (serviceId: string) => void;
  setCachedElevenLabsVoices: (voices: SettingsState["cachedElevenLabsVoices"]) => void;
  setCachedElevenLabsModels: (models: SettingsState["cachedElevenLabsModels"]) => void;
  clearApiCaches: () => void;
  setOllamaHost: (host: string) => void;
  setOllamaModel: (model: string) => void;
  setWhisperxBaseUrl: (url: string) => void;
  setWhisperxModel: (model: SettingsState["whisperxModel"]) => void;
  setWhisperxLanguage: (lang: string) => void;
  setWhisperxEnableVad: (enabled: boolean) => void;
  setWhisperxMinSilenceMs: (ms: number) => void;
  setWhisperxVadThreshold: (threshold: number) => void;
  setWhisperxPaddingMs: (ms: number) => void;
  setOllamaVisionModel: (model: string) => void;
  setWhisperxEnableDiarization: (enabled: boolean) => void;
  setAutoCutMinSegmentDuration: (ms: number) => void;
  setAutoCutUseSpeakerChanges: (enabled: boolean) => void;
  setAutoCutUseSilences: (enabled: boolean) => void;
  setComfyuiHost: (host: string) => void;
  setComfyuiDefaultImageModel: (model: string) => void;
  setComfyuiDefaultVideoModel: (model: string) => void;
  setComfyuiAutoDiscovery: (enabled: boolean) => void;
  openSettings: (tab?: SettingsTab) => void;
  closeSettings: () => void;
}

export const useSettingsStore = create<SettingsState>()(
  subscribeWithSelector(
    persist(
      (set, get) => ({
        autoSave: true,
        autoSaveInterval: 5,
        language: "en",

        defaultTtsProvider: "elevenlabs" as TtsProvider,
        defaultLlmProvider: "openai" as LlmProvider,
        defaultTranscriptionProvider: "whisperx" as TranscriptionProvider,
        defaultAggregator: "kie-ai" as AggregatorProvider,
        elevenLabsModel: "eleven_v3",
        favoriteVoices: [],
        favoriteModels: [],
        configuredServices: [],

        // Local providers
        ollamaHost: "http://192.168.10.182:47580",
        ollamaModel: "qwen2.5:14b-instruct",
        ollamaVisionModel: "qwen3-vl:4b",
        whisperxBaseUrl: "http://localhost:8000",
        whisperxModel: "large-v3" as const,
        whisperxLanguage: "en",
        whisperxEnableVad: true,
        whisperxEnableDiarization: true,
        whisperxMinSilenceMs: 300,
        whisperxVadThreshold: 0.5,
        whisperxPaddingMs: 100,

        // Auto-cut
        autoCutMinSegmentDuration: 0.5, // minimum 500ms segments
        autoCutUseSpeakerChanges: true,
        autoCutUseSilences: true,

        // ComfyUI
        comfyuiHost: "http://192.168.10.182:8188",
        comfyuiDefaultImageModel: "flux",
        comfyuiDefaultVideoModel: "ltx",
        comfyuiAutoDiscovery: true,

        cachedElevenLabsVoices: null,
        cachedElevenLabsModels: null,

        settingsOpen: false,
        settingsTab: "general" as SettingsTab,

        setAutoSave: (enabled: boolean) => set({ autoSave: enabled }),

        setAutoSaveInterval: (minutes: number) =>
          set({ autoSaveInterval: Math.max(1, Math.min(30, minutes)) }),

        setLanguage: (lang: string) => set({ language: lang }),

        setDefaultTtsProvider: (provider: TtsProvider) =>
          set({ defaultTtsProvider: provider }),

        setDefaultLlmProvider: (provider: LlmProvider) =>
          set({ defaultLlmProvider: provider }),

        setDefaultTranscriptionProvider: (provider: TranscriptionProvider) =>
          set({ defaultTranscriptionProvider: provider }),

        setDefaultAggregator: (provider: AggregatorProvider) =>
          set({ defaultAggregator: provider }),

        setElevenLabsModel: (model: string) =>
          set({ elevenLabsModel: model }),

        addFavoriteVoice: (voice) => {
          const { favoriteVoices } = get();
          if (!favoriteVoices.some((v) => v.voiceId === voice.voiceId)) {
            set({ favoriteVoices: [...favoriteVoices, voice] });
          }
        },

        removeFavoriteVoice: (voiceId: string) => {
          const { favoriteVoices } = get();
          set({ favoriteVoices: favoriteVoices.filter((v) => v.voiceId !== voiceId) });
        },

        addFavoriteModel: (model) => {
          const { favoriteModels } = get();
          if (!favoriteModels.some((m) => m.modelId === model.modelId)) {
            set({ favoriteModels: [...favoriteModels, model] });
          }
        },

        removeFavoriteModel: (modelId: string) => {
          const { favoriteModels } = get();
          set({ favoriteModels: favoriteModels.filter((m) => m.modelId !== modelId) });
        },

        addConfiguredService: (serviceId: string) => {
          const { configuredServices } = get();
          if (!configuredServices.includes(serviceId)) {
            set({ configuredServices: [...configuredServices, serviceId] });
          }
        },

        removeConfiguredService: (serviceId: string) => {
          const { configuredServices } = get();
          set({
            configuredServices: configuredServices.filter((id) => id !== serviceId),
          });
        },

        setCachedElevenLabsVoices: (voices) =>
          set({ cachedElevenLabsVoices: voices }),

        setCachedElevenLabsModels: (models) =>
          set({ cachedElevenLabsModels: models }),

        clearApiCaches: () =>
          set({ cachedElevenLabsVoices: null, cachedElevenLabsModels: null }),

        setOllamaHost: (host: string) => set({ ollamaHost: host }),

        setOllamaModel: (model: string) => set({ ollamaModel: model }),

        setWhisperxBaseUrl: (url: string) => set({ whisperxBaseUrl: url }),

        setWhisperxModel: (model: SettingsState["whisperxModel"]) =>
          set({ whisperxModel: model }),

        setWhisperxLanguage: (lang: string) => set({ whisperxLanguage: lang }),

        setWhisperxEnableVad: (enabled: boolean) =>
          set({ whisperxEnableVad: enabled }),

        setWhisperxMinSilenceMs: (ms: number) =>
          set({ whisperxMinSilenceMs: Math.max(100, ms) }),

        setWhisperxVadThreshold: (threshold: number) =>
          set({ whisperxVadThreshold: Math.max(0, Math.min(1, threshold)) }),

        setWhisperxPaddingMs: (ms: number) =>
          set({ whisperxPaddingMs: Math.max(0, ms) }),

        setOllamaVisionModel: (model: string) =>
          set({ ollamaVisionModel: model }),

        setWhisperxEnableDiarization: (enabled: boolean) =>
          set({ whisperxEnableDiarization: enabled }),

        setAutoCutMinSegmentDuration: (ms: number) =>
          set({ autoCutMinSegmentDuration: Math.max(0.1, ms) }),

        setAutoCutUseSpeakerChanges: (enabled: boolean) =>
          set({ autoCutUseSpeakerChanges: enabled }),

        setAutoCutUseSilences: (enabled: boolean) =>
          set({ autoCutUseSilences: enabled }),

        setComfyuiHost: (host: string) => set({ comfyuiHost: host }),

        setComfyuiDefaultImageModel: (model: string) =>
          set({ comfyuiDefaultImageModel: model }),

        setComfyuiDefaultVideoModel: (model: string) =>
          set({ comfyuiDefaultVideoModel: model }),

        setComfyuiAutoDiscovery: (enabled: boolean) =>
          set({ comfyuiAutoDiscovery: enabled }),

        openSettings: (tab?: SettingsTab) =>
          set({
            settingsOpen: true,
            settingsTab: tab ?? get().settingsTab,
          }),

        closeSettings: () => set({ settingsOpen: false }),
      }),
      {
        name: "openreel-settings",
        version: 2,
        migrate: (persisted: unknown, fromVersion: number) => {
          const state = (persisted ?? {}) as Record<string, unknown>;
          if (fromVersion < 2) {
            if (!state.ollamaHost || state.ollamaHost === "http://localhost:11434") {
              state.ollamaHost = "http://192.168.10.182:47580";
            }
            if (!state.comfyuiHost || state.comfyuiHost === "http://localhost:8188") {
              state.comfyuiHost = "http://192.168.10.182:8188";
            }
          }
          return state;
        },
        partialize: (state) => ({
          autoSave: state.autoSave,
          autoSaveInterval: state.autoSaveInterval,
          language: state.language,
          defaultTtsProvider: state.defaultTtsProvider,
          defaultLlmProvider: state.defaultLlmProvider,
          defaultTranscriptionProvider: state.defaultTranscriptionProvider,
          defaultAggregator: state.defaultAggregator,
          elevenLabsModel: state.elevenLabsModel,
          favoriteVoices: state.favoriteVoices,
          favoriteModels: state.favoriteModels,
          configuredServices: state.configuredServices,
          ollamaHost: state.ollamaHost,
          ollamaModel: state.ollamaModel,
          ollamaVisionModel: state.ollamaVisionModel,
          whisperxBaseUrl: state.whisperxBaseUrl,
          whisperxModel: state.whisperxModel,
          whisperxLanguage: state.whisperxLanguage,
          whisperxEnableVad: state.whisperxEnableVad,
          whisperxEnableDiarization: state.whisperxEnableDiarization,
          whisperxMinSilenceMs: state.whisperxMinSilenceMs,
          whisperxVadThreshold: state.whisperxVadThreshold,
          whisperxPaddingMs: state.whisperxPaddingMs,
          autoCutMinSegmentDuration: state.autoCutMinSegmentDuration,
          autoCutUseSpeakerChanges: state.autoCutUseSpeakerChanges,
          autoCutUseSilences: state.autoCutUseSilences,
          comfyuiHost: state.comfyuiHost,
          comfyuiDefaultImageModel: state.comfyuiDefaultImageModel,
          comfyuiDefaultVideoModel: state.comfyuiDefaultVideoModel,
          comfyuiAutoDiscovery: state.comfyuiAutoDiscovery,
        }),
      },
    ),
  ),
);

// Clear API caches when the secure session locks
onSessionLock(() => {
  useSettingsStore.getState().clearApiCaches();
});
