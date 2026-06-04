/**
 * Ollama Vision Provider — image/frame analysis via vision models
 *
 * Supports vision language models like qwen3-vl, llama4-vision, etc.
 * Capabilities:
 * - OCR (optical character recognition)
 * - Object detection
 * - Scene description
 * - Logo detection
 * - Visual summary
 */

import type {
  AIProvider,
  ChatMessage,
  ChatOptions,
  ChatResponse,
  ProviderCapabilities,
} from "../types";
import { ProviderError } from "../types";

const DEFAULT_VISION_MODEL = "qwen3-vl:4b";

export interface VisionAnalysisOptions {
  analysisType?: "ocr" | "objects" | "scene" | "logo" | "summary";
  language?: string;
  detailedResponse?: boolean;
}

export interface VisionAnalysisResponse {
  readonly type: string;
  readonly text: string;
  readonly confidence?: number;
  readonly detections?: Array<{
    label: string;
    confidence: number;
    boundingBox?: { x: number; y: number; width: number; height: number };
  }>;
  readonly metadata?: Record<string, unknown>;
}

export class OllamaVisionProvider implements AIProvider {
  readonly id = "ollama-vision";
  readonly name = "Ollama Vision";
  readonly capabilities: ProviderCapabilities = {
    vision: true,
    chat: true,
  };

  private host: string;
  private model: string;

  constructor(host?: string, model?: string) {
    this.host = host || "http://localhost:11434";
    this.model = model || DEFAULT_VISION_MODEL;
  }

  setHost(host: string): void {
    this.host = host;
  }

  setModel(model: string): void {
    this.model = model;
  }

  /**
   * Analyze image with vision model
   * Accepts image as base64 string or URL
   */
  async analyzeImage(
    imageSource: string | File | Blob,
    prompt: string,
    options?: ChatOptions,
  ): Promise<ChatResponse> {
    let imageBase64: string;

    // Convert image to base64
    if (typeof imageSource === "string") {
      if (imageSource.startsWith("http://") || imageSource.startsWith("https://")) {
        // For URLs, we'll pass it as-is and let the model handle it
        imageBase64 = imageSource;
      } else if (imageSource.startsWith("data:")) {
        // Already data URL
        imageBase64 = imageSource;
      } else {
        // Assume it's already base64
        imageBase64 = imageSource;
      }
    } else if (imageSource instanceof File || imageSource instanceof Blob) {
      imageBase64 = await this.blobToBase64(imageSource);
    } else {
      throw new ProviderError(
        "ollama-vision",
        "INVALID_IMAGE",
        "Image must be a string (base64 or URL), File, or Blob",
      );
    }

    const messages: ChatMessage[] = [
      {
        role: "user",
        content: prompt,
      },
    ];

    const payload = {
      model: this.model,
      messages,
      images: [imageBase64],
      stream: false,
      temperature: options?.temperature ?? 0.7,
      top_p: options?.topP,
      top_k: options?.topK,
      num_predict: options?.maxTokens ?? 1500,
    };

    try {
      const res = await fetch(`${this.host}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new ProviderError(
          "ollama-vision",
          "HTTP_ERROR",
          `${res.status} ${res.statusText}`,
        );
      }

      const data = (await res.json()) as {
        message?: { content: string };
        prompt_eval_count?: number;
        eval_count?: number;
      };

      return {
        content: data.message?.content || "",
        finishReason: "stop",
        usage: {
          promptTokens: data.prompt_eval_count || 0,
          completionTokens: data.eval_count || 0,
          totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
        },
      };
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(
        "ollama-vision",
        "REQUEST_FAILED",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  /**
   * OCR — extract text from image
   */
  async ocr(imageSource: string | File | Blob): Promise<VisionAnalysisResponse> {
    const prompt =
      "Extract all visible text from this image. Preserve the layout and structure. Return only the extracted text.";

    const response = await this.analyzeImage(imageSource, prompt);

    return {
      type: "ocr",
      text: response.content,
      metadata: {
        tokens: response.usage,
      },
    };
  }

  /**
   * Object detection — identify objects in image
   */
  async detectObjects(
    imageSource: string | File | Blob,
  ): Promise<VisionAnalysisResponse> {
    const prompt =
      "Identify and list all objects, people, animals, and text visible in this image. For each, describe: 1) What it is, 2) Approximate location (top/middle/bottom, left/center/right), 3) Confidence (high/medium/low). Format as a bullet list.";

    const response = await this.analyzeImage(imageSource, prompt);

    return {
      type: "objects",
      text: response.content,
      metadata: {
        tokens: response.usage,
      },
    };
  }

  /**
   * Scene description — describe what's happening in the image
   */
  async describeScene(
    imageSource: string | File | Blob,
  ): Promise<VisionAnalysisResponse> {
    const prompt =
      "Provide a detailed scene description of this image. Include: setting, main subjects, lighting, composition, mood, and any notable details. Be specific and vivid.";

    const response = await this.analyzeImage(imageSource, prompt);

    return {
      type: "scene",
      text: response.content,
      metadata: {
        tokens: response.usage,
      },
    };
  }

  /**
   * Logo detection — identify logos, brands, and text in image
   */
  async detectLogos(
    imageSource: string | File | Blob,
  ): Promise<VisionAnalysisResponse> {
    const prompt =
      "Identify all logos, brand names, product names, and watermarks visible in this image. For each, describe what it is and its approximate location.";

    const response = await this.analyzeImage(imageSource, prompt);

    return {
      type: "logo",
      text: response.content,
      metadata: {
        tokens: response.usage,
      },
    };
  }

  /**
   * Visual summary — generate a concise summary of the image
   */
  async summarize(imageSource: string | File | Blob): Promise<VisionAnalysisResponse> {
    const prompt =
      "Provide a brief 1-2 sentence summary of what this image shows. Be concise and focus on the most important elements.";

    const response = await this.analyzeImage(imageSource, prompt);

    return {
      type: "summary",
      text: response.content,
      metadata: {
        tokens: response.usage,
      },
    };
  }

  /**
   * Convert Blob to base64 data URL
   */
  private async blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result;
        if (typeof result === "string") {
          resolve(result);
        } else {
          reject(new Error("FileReader did not return a string"));
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.host}/api/tags`, {
        method: "GET",
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

export { DEFAULT_VISION_MODEL };
