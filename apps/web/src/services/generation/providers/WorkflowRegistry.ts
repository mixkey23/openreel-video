/**
 * ComfyUI Workflow Registry
 *
 * Centralized registry for ComfyUI workflows.
 * Discovers workflows from ComfyUI server and caches them locally.
 */

import type { ComfyUIWorkflow } from "./types";

export class WorkflowRegistry {
  private workflows: Map<string, ComfyUIWorkflow> = new Map();
  private byCategory: Map<string, ComfyUIWorkflow[]> = new Map();
  private comfyuiHost: string;
  /** Override for the full discovery URL (used for HTTPS proxy routing) */
  private discoveryEndpoint: string | null = null;
  private refreshInterval: ReturnType<typeof setTimeout> | null = null;

  constructor(comfyuiHost: string = "http://localhost:8188") {
    this.comfyuiHost = comfyuiHost;
    this.initializeCategories();
  }

  private initializeCategories(): void {
    const categories = ["image", "video", "audio", "upscaling", "enhancement"] as const;
    for (const cat of categories) {
      this.byCategory.set(cat, []);
    }
  }

  /**
   * Register a workflow manually
   */
  register(workflow: ComfyUIWorkflow): void {
    this.workflows.set(workflow.id, workflow);

    const category = workflow.category;
    if (!this.byCategory.has(category)) {
      this.byCategory.set(category, []);
    }

    const categoryList = this.byCategory.get(category)!;
    if (!categoryList.find((w) => w.id === workflow.id)) {
      categoryList.push(workflow);
    }
  }

  /**
   * Set a custom discovery endpoint (e.g. HTTPS proxy URL).
   * When set, discoverWorkflows() uses this URL instead of comfyuiHost + /openreel/workflows.
   */
  setDiscoveryEndpoint(url: string | null): void {
    this.discoveryEndpoint = url;
  }

  /**
   * Discover workflows from ComfyUI server
   * Polls the /openreel/workflows endpoint (or the proxy override).
   */
  async discoverWorkflows(): Promise<ComfyUIWorkflow[]> {
    const url = this.discoveryEndpoint ?? `${this.comfyuiHost}/openreel/workflows`;
    try {
      const res = await fetch(url, {
        method: "GET",
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const workflows = (await res.json()) as ComfyUIWorkflow[];

      // Register all discovered workflows
      for (const workflow of workflows) {
        this.register(workflow);
      }

      return workflows;
    } catch (err) {
      console.error(
        "[WorkflowRegistry] Discovery failed:",
        err instanceof Error ? err.message : String(err),
      );
      return [];
    }
  }

  /**
   * Get workflow by ID
   */
  get(id: string): ComfyUIWorkflow | undefined {
    return this.workflows.get(id);
  }

  /**
   * Get all workflows in a category
   */
  getByCategory(
    category: "image" | "video" | "audio" | "upscaling" | "enhancement",
  ): ComfyUIWorkflow[] {
    return this.byCategory.get(category) || [];
  }

  /**
   * Search workflows by name or tag
   */
  search(query: string): ComfyUIWorkflow[] {
    const lowerQuery = query.toLowerCase();
    return Array.from(this.workflows.values()).filter(
      (w) =>
        w.name.toLowerCase().includes(lowerQuery) ||
        w.description?.toLowerCase().includes(lowerQuery) ||
        w.tags?.some((t) => t.toLowerCase().includes(lowerQuery)),
    );
  }

  /**
   * Get all workflows
   */
  getAll(): ComfyUIWorkflow[] {
    return Array.from(this.workflows.values());
  }

  /**
   * Get count of workflows by category
   */
  countByCategory(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const [cat, workflows] of this.byCategory) {
      counts[cat] = workflows.length;
    }
    return counts;
  }

  /**
   * Unregister a workflow
   */
  unregister(id: string): void {
    const workflow = this.workflows.get(id);
    if (!workflow) return;

    this.workflows.delete(id);

    const category = workflow.category;
    const categoryList = this.byCategory.get(category);
    if (categoryList) {
      this.byCategory.set(
        category,
        categoryList.filter((w) => w.id !== id),
      );
    }
  }

  /**
   * Clear all workflows
   */
  clear(): void {
    this.workflows.clear();
    this.initializeCategories();
  }

  /**
   * Set up auto-discovery polling
   * Calls discoverWorkflows() every interval seconds
   */
  startAutoDiscovery(intervalSeconds: number = 60): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }

    // Initial discovery
    this.discoverWorkflows().catch(console.error);

    // Polling
    this.refreshInterval = setInterval(
      () => this.discoverWorkflows().catch(console.error),
      intervalSeconds * 1000,
    );
  }

  /**
   * Stop auto-discovery polling
   */
  stopAutoDiscovery(): void {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
  }

  /**
   * Change ComfyUI host.
   * Resets the discovery endpoint override so the default path is used again.
   */
  setHost(host: string): void {
    this.comfyuiHost = host;
    this.discoveryEndpoint = null;
  }
}

// Singleton instance
export const workflowRegistry = new WorkflowRegistry();
