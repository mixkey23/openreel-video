/**
 * AI Providers — central export
 */

export { providerRegistry } from "./ProviderRegistry";
export type { AIProvider, ProviderCapabilities } from "./types";
export {
  type ChatMessage,
  type ChatOptions,
  type ChatResponse,
  type TranscriptionResponse,
  type TranscriptionSegment,
  type TranscriptionWord,
  type SilenceBlock,
  ProviderError,
} from "./types";

export { OllamaProvider, DEFAULT_HOST, DEFAULT_MODEL } from "./ollama/OllamaProvider";
export type { OllamaConfig } from "./ollama/OllamaProvider";

export { OllamaVisionProvider, DEFAULT_VISION_MODEL } from "./ollama/OllamaVisionProvider";
export type {
  VisionAnalysisOptions,
  VisionAnalysisResponse,
} from "./ollama/OllamaVisionProvider";
