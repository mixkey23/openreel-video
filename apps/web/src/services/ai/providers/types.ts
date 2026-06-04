/**
 * AI Provider Registry — base types
 *
 * Unified interface for all AI providers to eliminate rigid provider categories
 * (LLM, TTS, Aggregator) in favor of granular capabilities.
 */

export interface ProviderCapabilities {
  chat?: boolean;
  vision?: boolean;
  embeddings?: boolean;
  transcription?: boolean;
  diarization?: boolean;
  silenceDetection?: boolean;
  tts?: boolean;
  voiceClone?: boolean;
  imageGeneration?: boolean;
  imageEditing?: boolean;
  videoGeneration?: boolean;
  videoEditing?: boolean;
  audioGeneration?: boolean;
  upscaling?: boolean;
}

export interface AIProvider {
  readonly id: string;
  readonly name: string;
  readonly capabilities: ProviderCapabilities;
}

export interface ChatMessage {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
}

export interface ChatOptions {
  temperature?: number;
  topP?: number;
  topK?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface ChatResponse {
  readonly content: string;
  readonly finishReason?: "stop" | "length" | "error";
  readonly usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface TranscriptionSegment {
  readonly id: number;
  readonly seek: number;
  readonly start: number;
  readonly end: number;
  readonly text: string;
  readonly tokens: readonly number[];
  readonly temperature: number;
  readonly avgLogprob: number;
  readonly compressionRatio: number;
  readonly noSpeechProb: number;
  readonly confidence?: number;
}

export interface TranscriptionWord {
  readonly word: string;
  readonly start: number;
  readonly end: number;
  readonly confidence?: number;
}

export interface TranscriptionResponse {
  readonly language: string;
  readonly duration: number;
  readonly text: string;
  readonly segments: readonly TranscriptionSegment[];
  readonly words?: readonly TranscriptionWord[];
  readonly speaker_diarization?: Array<{
    speaker: string;
    start: number;
    end: number;
    text: string;
  }>;
}

export interface SilenceBlock {
  readonly start: number;
  readonly end: number;
  readonly duration: number;
}

export class ProviderError extends Error {
  constructor(
    readonly provider: string,
    readonly code: string,
    message: string,
  ) {
    super(`[${provider}] ${code}: ${message}`);
    this.name = "ProviderError";
  }
}
