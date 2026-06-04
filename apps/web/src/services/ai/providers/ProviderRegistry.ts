/**
 * AI Provider Registry
 *
 * Centralized registry for dynamically registering AI providers.
 * Providers are looked up by ID or by capability to decouple the UI from provider selection.
 */

import type { AIProvider, ProviderCapabilities } from "./types";

class ProviderRegistry {
  private providers: Map<string, AIProvider> = new Map();

  /**
   * Register a provider
   */
  register(provider: AIProvider): void {
    if (this.providers.has(provider.id)) {
      console.warn(`Provider ${provider.id} already registered, overwriting`);
    }
    this.providers.set(provider.id, provider);
  }

  /**
   * Get provider by ID
   */
  get(id: string): AIProvider | undefined {
    return this.providers.get(id);
  }

  /**
   * Get all providers that support a specific capability
   */
  getByCapability(capability: keyof ProviderCapabilities): AIProvider[] {
    return Array.from(this.providers.values()).filter(
      (p) => p.capabilities[capability],
    );
  }

  /**
   * Get all registered providers
   */
  getAll(): AIProvider[] {
    return Array.from(this.providers.values());
  }

  /**
   * Remove a provider
   */
  unregister(id: string): void {
    this.providers.delete(id);
  }

  /**
   * Check if a provider is registered
   */
  has(id: string): boolean {
    return this.providers.has(id);
  }

  /**
   * Get count of registered providers
   */
  count(): number {
    return this.providers.size;
  }
}

// Singleton instance
export const providerRegistry = new ProviderRegistry();

export type { AIProvider, ProviderCapabilities };
