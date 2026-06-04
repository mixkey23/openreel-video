/**
 * Ollama Provider — local LLM via Ollama
 *
 * Supports chat completion with streaming and non-streaming modes.
 * Default model: qwen2.5:14b-instruct
 * Default host: http://localhost:11434
 */

import type {
  AIProvider,
  ChatMessage,
  ChatOptions,
  ChatResponse,
  ProviderCapabilities,
} from "../types";
import { ProviderError } from "../types";

const DEFAULT_HOST = "http://localhost:11434";
const DEFAULT_MODEL = "qwen2.5:14b-instruct";

/**
 * Route Ollama calls through the Framesmith HTTPS proxy when the page is served over HTTPS.
 * Path must start with /ollama/ — maps to /api/proxy/ollama/<rest>
 */
function ollamaProxyUrl(path: string, host: string): string {
  if (typeof window !== "undefined" && window.location.protocol === "https:") {
    const proxyPath = path.replace(/^\/api\//, "/ollama/");
    return `/api/proxy${proxyPath}?host=${encodeURIComponent(host)}`;
  }
  return `${host.replace(/\/$/, "")}${path}`;
}

export interface OllamaConfig {
  host?: string;
  model?: string;
}

export class OllamaProvider implements AIProvider {
  readonly id = "ollama";
  readonly name = "Ollama";
  readonly capabilities: ProviderCapabilities = {
    chat: true,
  };

  private host: string;
  private model: string;

  constructor(config?: OllamaConfig) {
    this.host = config?.host || DEFAULT_HOST;
    this.model = config?.model || DEFAULT_MODEL;
  }

  setHost(host: string): void {
    this.host = host;
  }

  setModel(model: string): void {
    this.model = model;
  }

  /**
   * Chat completion — non-streaming only
   * For streaming, use chatStream() directly
   */
  async chat(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): Promise<ChatResponse> {
    return this.chatNonStreaming(messages, options);
  }

  /**
   * Get a stream of chat completion chunks
   * Usage: for await (const chunk of provider.chatStream(messages)) { ... }
   */
  chatStream(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): AsyncGenerator<string> {
    return this.streamChat(messages, options);
  }

  /**
   * Non-streaming chat completion
   */
  private async chatNonStreaming(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): Promise<ChatResponse> {
    const payload = {
      model: this.model,
      messages,
      stream: false,
      temperature: options?.temperature ?? 0.7,
      top_p: options?.topP,
      top_k: options?.topK,
      num_predict: options?.maxTokens ?? 1500,
    };

    try {
      const res = await fetch(ollamaProxyUrl("/api/chat", this.host), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new ProviderError(
          "ollama",
          "HTTP_ERROR",
          `${res.status} ${res.statusText}`,
        );
      }

      const data = (await res.json()) as {
        model: string;
        created_at: string;
        message: { role: string; content: string };
        done: boolean;
        total_duration: number;
        load_duration: number;
        prompt_eval_count: number;
        prompt_eval_duration: number;
        eval_count: number;
        eval_duration: number;
      };

      return {
        content: data.message.content,
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
        "ollama",
        "REQUEST_FAILED",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  /**
   * Internal streaming implementation
   */
  private async *streamChat(
    messages: ChatMessage[],
    options?: ChatOptions,
  ): AsyncGenerator<string> {
    const payload = {
      model: this.model,
      messages,
      stream: true,
      temperature: options?.temperature ?? 0.7,
      top_p: options?.topP,
      top_k: options?.topK,
      num_predict: options?.maxTokens ?? 1500,
    };

    try {
      const res = await fetch(ollamaProxyUrl("/api/chat", this.host), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new ProviderError(
          "ollama",
          "HTTP_ERROR",
          `${res.status} ${res.statusText}`,
        );
      }

      const reader = res.body?.getReader();
      if (!reader) {
        throw new ProviderError(
          "ollama",
          "NO_STREAM",
          "Response body is not readable",
        );
      }

      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");

          // Keep last incomplete line in buffer
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.trim()) continue;

            try {
              const json = JSON.parse(line) as {
                message?: { content: string };
              };
              if (json.message?.content) {
                yield json.message.content;
              }
            } catch {
              // Skip invalid JSON lines
            }
          }
        }

        // Flush remaining buffer
        if (buffer.trim()) {
          try {
            const json = JSON.parse(buffer) as {
              message?: { content: string };
            };
            if (json.message?.content) {
              yield json.message.content;
            }
          } catch {
            // Ignore
          }
        }
      } finally {
        reader.releaseLock();
      }
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(
        "ollama",
        "STREAM_FAILED",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  /**
   * Health check — verify Ollama is running
   */
  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(ollamaProxyUrl("/api/tags", this.host), {
        method: "GET",
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * List available models
   */
  async listModels(): Promise<string[]> {
    try {
      const res = await fetch(ollamaProxyUrl("/api/tags", this.host), {
        method: "GET",
      });

      if (!res.ok) {
        throw new ProviderError(
          "ollama",
          "HTTP_ERROR",
          `${res.status} ${res.statusText}`,
        );
      }

      const data = (await res.json()) as {
        models?: Array<{ name: string }>;
      };
      return data.models?.map((m) => m.name) || [];
    } catch (err) {
      if (err instanceof ProviderError) throw err;
      throw new ProviderError(
        "ollama",
        "LIST_FAILED",
        err instanceof Error ? err.message : String(err),
      );
    }
  }
}

export { DEFAULT_HOST, DEFAULT_MODEL };
