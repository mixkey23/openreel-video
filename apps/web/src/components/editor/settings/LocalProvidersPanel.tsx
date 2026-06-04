/**
 * LocalProvidersPanel — Settings for Ollama, ComfyUI, and WhisperX
 *
 * Allows users to configure host endpoints, models, and advanced options
 * for all local AI providers directly within OpenReel.
 */

import React, { useState, useCallback } from "react";
import {
  Server,
  RefreshCw,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Trash2,
  Upload,
  Loader2,
} from "lucide-react";
import { Switch, Input, Button, Label } from "@openreel/ui";
import { useSettingsStore } from "../../../stores/settings-store";
import { workflowRegistry } from "../../../services/generation/providers/ComfyUIProvider";
import type { ComfyUIWorkflow } from "../../../services/generation/providers/types";
import { toast } from "../../../stores/notification-store";

/* ── Tiny helpers ─────────────────────────────────────────────── */

function StatusBadge({ ok }: { ok: boolean | null }) {
  if (ok === null)
    return (
      <span className="flex items-center gap-1 text-xs text-text-muted">
        <Loader2 size={12} className="animate-spin" /> Checking…
      </span>
    );
  if (ok)
    return (
      <span className="flex items-center gap-1 text-xs text-green-500">
        <CheckCircle2 size={12} /> Connected
      </span>
    );
  return (
    <span className="flex items-center gap-1 text-xs text-error">
      <XCircle size={12} /> Unreachable
    </span>
  );
}

function SectionHeader({
  title,
  description,
  open,
  onToggle,
}: {
  title: string;
  description: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-start justify-between text-left gap-2"
    >
      <div>
        <h3 className="text-sm font-medium text-text-primary">{title}</h3>
        <p className="text-xs text-text-muted mt-0.5">{description}</p>
      </div>
      {open ? (
        <ChevronUp size={14} className="text-text-muted mt-1 shrink-0" />
      ) : (
        <ChevronDown size={14} className="text-text-muted mt-1 shrink-0" />
      )}
    </button>
  );
}

function HostField({
  label,
  value,
  onChange,
  status,
  onTest,
  testing,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  status: boolean | null;
  onTest: () => void;
  testing: boolean;
  placeholder: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-text-secondary">{label}</Label>
        <StatusBadge ok={status} />
      </div>
      <div className="flex gap-2">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="h-9 text-sm flex-1"
        />
        <Button
          variant="outline"
          size="sm"
          onClick={onTest}
          disabled={testing}
          className="h-9 shrink-0 gap-1"
        >
          {testing ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <RefreshCw size={12} />
          )}
          Test
        </Button>
      </div>
    </div>
  );
}

/**
 * Build a proxy URL so the browser never makes direct http:// requests
 * from an https:// page (Mixed Content).
 *
 * When window.location.protocol is https: all local-service calls are
 * routed through /api/proxy/* (Framesmith's own HTTPS endpoint).
 * When running on plain http: (local dev) the direct URL is used instead.
 */
function proxyUrl(path: string, serviceHost: string): string {
  const isHttps = window.location.protocol === "https:";
  if (!isHttps) {
    // Local dev — call services directly
    return `${serviceHost.replace(/\/$/, "")}${path}`;
  }
  // Production (HTTPS) — route through Framesmith proxy
  const encoded = encodeURIComponent(serviceHost);
  return `/api/proxy${path}?host=${encoded}`;
}

/* ── Main component ───────────────────────────────────────────── */

export const LocalProvidersPanel: React.FC = () => {
  const settings = useSettingsStore();

  // Section collapse state
  const [ollamaOpen, setOllamaOpen] = useState(true);
  const [whisperxOpen, setWhisperxOpen] = useState(false);
  const [comfyuiOpen, setComfyuiOpen] = useState(false);

  // Connection status
  const [ollamaStatus, setOllamaStatus] = useState<boolean | null>(undefined as unknown as boolean | null);
  const [whisperxStatus, setWhisperxStatus] = useState<boolean | null>(undefined as unknown as boolean | null);
  const [comfyuiStatus, setComfyuiStatus] = useState<boolean | null>(undefined as unknown as boolean | null);

  // Testing flags
  const [testingOllama, setTestingOllama] = useState(false);
  const [testingWhisperx, setTestingWhisperx] = useState(false);
  const [testingComfyui, setTestingComfyui] = useState(false);

  // Ollama available models
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);

  // ComfyUI workflow management
  const [loadingWorkflows, setLoadingWorkflows] = useState(false);
  const [workflows, setWorkflows] = useState<ComfyUIWorkflow[]>([]);

  /* ── Test handlers ─────────────────────────────────────────── */

  const testOllama = useCallback(async () => {
    setTestingOllama(true);
    setOllamaStatus(null);
    try {
      const res = await fetch(proxyUrl("/ollama/tags", settings.ollamaHost));
      if (res.ok) {
        const data = (await res.json()) as { models?: Array<{ name: string }> };
        const names = data.models?.map((m) => m.name) ?? [];
        setOllamaModels(names);
        setOllamaStatus(true);
        toast.success("Ollama connected", `Found ${names.length} model${names.length !== 1 ? "s" : ""}.`);
      } else {
        setOllamaStatus(false);
      }
    } catch {
      setOllamaStatus(false);
      toast.error("Ollama unreachable", `Could not connect to ${settings.ollamaHost}`);
    }
    setTestingOllama(false);
  }, [settings.ollamaHost]);

  const testWhisperx = useCallback(async () => {
    setTestingWhisperx(true);
    setWhisperxStatus(null);
    try {
      const res = await fetch(proxyUrl("/whisperx/health", settings.whisperxBaseUrl));
      setWhisperxStatus(res.ok);
      if (res.ok) {
        toast.success("WhisperX connected", "Transcription service is running.");
      } else {
        toast.error("WhisperX error", `Server responded with ${res.status}`);
      }
    } catch {
      setWhisperxStatus(false);
      toast.error("WhisperX unreachable", `Could not connect to ${settings.whisperxBaseUrl}`);
    }
    setTestingWhisperx(false);
  }, [settings.whisperxBaseUrl]);

  const testComfyui = useCallback(async () => {
    setTestingComfyui(true);
    setComfyuiStatus(null);
    try {
      const res = await fetch(proxyUrl("/comfyui/system_stats", settings.comfyuiHost));
      setComfyuiStatus(res.ok);
      if (res.ok) {
        toast.success("ComfyUI connected", "Generation server is running.");
      } else {
        toast.error("ComfyUI error", `Server responded with ${res.status}`);
      }
    } catch {
      setComfyuiStatus(false);
      toast.error("ComfyUI unreachable", `Could not connect to ${settings.comfyuiHost}`);
    }
    setTestingComfyui(false);
  }, [settings.comfyuiHost]);

  /* ── Workflow handlers ─────────────────────────────────────── */

  const discoverWorkflows = useCallback(async () => {
    setLoadingWorkflows(true);
    try {
      // Use proxy endpoint so HTTPS pages don't get blocked
      const discoverEndpoint = proxyUrl("/comfyui/workflows", settings.comfyuiHost);
      workflowRegistry.setHost(settings.comfyuiHost);
      workflowRegistry.setDiscoveryEndpoint(discoverEndpoint);
      const found = await workflowRegistry.discoverWorkflows();
      setWorkflows(workflowRegistry.getAll());
      toast.success("Workflows loaded", `Found ${found.length} workflow${found.length !== 1 ? "s" : ""}.`);
    } catch {
      toast.error("Discovery failed", "Could not load workflows from ComfyUI.");
    }
    setLoadingWorkflows(false);
  }, [settings.comfyuiHost]);

  const removeWorkflow = useCallback((id: string) => {
    workflowRegistry.unregister(id);
    setWorkflows(workflowRegistry.getAll());
  }, []);

  const handleUploadWorkflow = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files) return;

      Array.from(files).forEach((file) => {
        const reader = new FileReader();
        reader.onload = (ev) => {
          try {
            const schema = JSON.parse(ev.target?.result as string) as Record<string, unknown>;
            const id = file.name.replace(/\.json$/i, "");
            const category = detectWorkflowCategory(schema);
            workflowRegistry.register({
              id,
              name: id
                .split(/[-_]/)
                .map((w) => w[0].toUpperCase() + w.slice(1))
                .join(" "),
              category,
              schema,
              description: `Imported from ${file.name}`,
              tags: [category],
            });
            setWorkflows(workflowRegistry.getAll());
            toast.success("Workflow imported", file.name);
          } catch {
            toast.error("Invalid workflow", `${file.name} is not valid JSON.`);
          }
        };
        reader.readAsText(file);
      });

      // Reset input
      e.target.value = "";
    },
    [],
  );

  /* ── Render ────────────────────────────────────────────────── */

  return (
    <div className="space-y-5 pb-4">

      {/* ── Ollama ──────────────────────────────────────────── */}
      <div className="space-y-3">
        <SectionHeader
          title="Ollama (Local LLM)"
          description="Chat completions and vision analysis via locally hosted models."
          open={ollamaOpen}
          onToggle={() => setOllamaOpen((v) => !v)}
        />

        {ollamaOpen && (
          <div className="space-y-3 pl-0.5">
            <HostField
              label="Host URL"
              value={settings.ollamaHost}
              onChange={settings.setOllamaHost}
              status={ollamaStatus}
              onTest={testOllama}
              testing={testingOllama}
              placeholder="http://localhost:11434"
            />

            <div className="space-y-1.5">
              <Label className="text-xs text-text-secondary">
                Default Chat Model
              </Label>
              {ollamaModels.length > 0 ? (
                <select
                  value={settings.ollamaModel}
                  onChange={(e) => settings.setOllamaModel(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {ollamaModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  value={settings.ollamaModel}
                  onChange={(e) => settings.setOllamaModel(e.target.value)}
                  placeholder="qwen2.5:14b-instruct"
                  className="h-9 text-sm"
                />
              )}
              {ollamaModels.length === 0 && (
                <p className="text-[11px] text-text-muted">
                  Click <strong>Test</strong> above to auto-discover available models.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs text-text-secondary">
                Default Vision Model
              </Label>
              {ollamaModels.length > 0 ? (
                <select
                  value={settings.ollamaVisionModel}
                  onChange={(e) => settings.setOllamaVisionModel(e.target.value)}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  {ollamaModels.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  value={settings.ollamaVisionModel}
                  onChange={(e) => settings.setOllamaVisionModel(e.target.value)}
                  placeholder="qwen3-vl:4b"
                  className="h-9 text-sm"
                />
              )}
            </div>
          </div>
        )}
      </div>

      <div className="h-px bg-border" />

      {/* ── WhisperX ────────────────────────────────────────── */}
      <div className="space-y-3">
        <SectionHeader
          title="WhisperX (Transcription)"
          description="Local speech-to-text with word-level timestamps, diarization, and silence detection."
          open={whisperxOpen}
          onToggle={() => setWhisperxOpen((v) => !v)}
        />

        {whisperxOpen && (
          <div className="space-y-3 pl-0.5">
            <HostField
              label="Service URL"
              value={settings.whisperxBaseUrl}
              onChange={settings.setWhisperxBaseUrl}
              status={whisperxStatus}
              onTest={testWhisperx}
              testing={testingWhisperx}
              placeholder="http://localhost:8000"
            />

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-text-secondary">Model</Label>
                <select
                  value={settings.whisperxModel}
                  onChange={(e) =>
                    settings.setWhisperxModel(
                      e.target.value as typeof settings.whisperxModel,
                    )
                  }
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="large-v3">large-v3 (Best)</option>
                  <option value="large-v3-turbo">large-v3-turbo (Fast)</option>
                  <option value="medium">medium</option>
                  <option value="small">small (Fastest)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-text-secondary">Language</Label>
                <Input
                  value={settings.whisperxLanguage}
                  onChange={(e) => settings.setWhisperxLanguage(e.target.value)}
                  placeholder="en"
                  className="h-9 text-sm"
                />
              </div>
            </div>

            <div className="space-y-3 rounded-md border border-border p-3 bg-background-secondary">
              <p className="text-xs font-medium text-text-secondary">
                Voice Activity Detection (VAD)
              </p>

              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-sm text-text-secondary">Enable VAD</Label>
                  <p className="text-xs text-text-muted">
                    Skip non-speech regions to speed up transcription
                  </p>
                </div>
                <Switch
                  checked={settings.whisperxEnableVad}
                  onCheckedChange={settings.setWhisperxEnableVad}
                />
              </div>

              {settings.whisperxEnableVad && (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <Label className="text-sm text-text-secondary">Speaker Diarization</Label>
                      <p className="text-xs text-text-muted">
                        Identify who is speaking at each moment
                      </p>
                    </div>
                    <Switch
                      checked={settings.whisperxEnableDiarization}
                      onCheckedChange={settings.setWhisperxEnableDiarization}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1.5">
                      <Label className="text-[11px] text-text-muted">
                        Min silence (ms)
                      </Label>
                      <input
                        type="number"
                        min={100}
                        max={5000}
                        step={50}
                        value={settings.whisperxMinSilenceMs}
                        onChange={(e) =>
                          settings.setWhisperxMinSilenceMs(Number(e.target.value))
                        }
                        className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] text-text-muted">
                        Threshold
                      </Label>
                      <input
                        type="number"
                        min={0}
                        max={1}
                        step={0.05}
                        value={settings.whisperxVadThreshold}
                        onChange={(e) =>
                          settings.setWhisperxVadThreshold(Number(e.target.value))
                        }
                        className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-[11px] text-text-muted">
                        Padding (ms)
                      </Label>
                      <input
                        type="number"
                        min={0}
                        max={1000}
                        step={10}
                        value={settings.whisperxPaddingMs}
                        onChange={(e) =>
                          settings.setWhisperxPaddingMs(Number(e.target.value))
                        }
                        className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                      />
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Auto-cut config */}
            <div className="space-y-3 rounded-md border border-border p-3 bg-background-secondary">
              <p className="text-xs font-medium text-text-secondary">
                Auto-Cut Settings
              </p>

              <div className="flex items-center justify-between">
                <Label className="text-sm text-text-secondary">
                  Cut at silences
                </Label>
                <Switch
                  checked={settings.autoCutUseSilences}
                  onCheckedChange={settings.setAutoCutUseSilences}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label className="text-sm text-text-secondary">
                  Cut at speaker changes
                </Label>
                <Switch
                  checked={settings.autoCutUseSpeakerChanges}
                  onCheckedChange={settings.setAutoCutUseSpeakerChanges}
                />
              </div>

              <div className="flex items-center gap-3">
                <Label className="text-xs text-text-muted whitespace-nowrap shrink-0">
                  Min segment (s)
                </Label>
                <input
                  type="number"
                  min={0.1}
                  max={10}
                  step={0.1}
                  value={settings.autoCutMinSegmentDuration}
                  onChange={(e) =>
                    settings.setAutoCutMinSegmentDuration(Number(e.target.value))
                  }
                  className="h-8 w-24 rounded-md border border-input bg-background px-2 text-sm"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="h-px bg-border" />

      {/* ── ComfyUI ─────────────────────────────────────────── */}
      <div className="space-y-3">
        <SectionHeader
          title="ComfyUI (Image & Video Generation)"
          description="Local AI generation server for images, videos, upscaling, and more."
          open={comfyuiOpen}
          onToggle={() => setComfyuiOpen((v) => !v)}
        />

        {comfyuiOpen && (
          <div className="space-y-4 pl-0.5">
            <HostField
              label="Server URL"
              value={settings.comfyuiHost}
              onChange={settings.setComfyuiHost}
              status={comfyuiStatus}
              onTest={testComfyui}
              testing={testingComfyui}
              placeholder="http://localhost:8188"
            />

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs text-text-secondary">
                  Default Image Model
                </Label>
                <select
                  value={settings.comfyuiDefaultImageModel}
                  onChange={(e) =>
                    settings.setComfyuiDefaultImageModel(e.target.value)
                  }
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="flux">Flux</option>
                  <option value="sdxl">SDXL</option>
                  <option value="qwen-image">Qwen Image</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-text-secondary">
                  Default Video Model
                </Label>
                <select
                  value={settings.comfyuiDefaultVideoModel}
                  onChange={(e) =>
                    settings.setComfyuiDefaultVideoModel(e.target.value)
                  }
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                >
                  <option value="ltx">LTX</option>
                  <option value="wan">Wan</option>
                  <option value="hunyuan">Hunyuan</option>
                  <option value="cosmos">Cosmos</option>
                  <option value="veo">Veo</option>
                </select>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label className="text-sm text-text-secondary">
                  Auto-discover workflows
                </Label>
                <p className="text-xs text-text-muted mt-0.5">
                  Periodically refresh workflow list from ComfyUI server
                </p>
              </div>
              <Switch
                checked={settings.comfyuiAutoDiscovery}
                onCheckedChange={settings.setComfyuiAutoDiscovery}
              />
            </div>

            {/* Workflow manager */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-text-secondary">
                  Workflows
                </p>
                <div className="flex gap-2">
                  {/* Upload workflow JSON */}
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept=".json"
                      multiple
                      onChange={handleUploadWorkflow}
                      className="sr-only"
                    />
                    <span className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md border border-border text-xs text-text-secondary hover:bg-background-secondary transition-colors">
                      <Upload size={11} />
                      Import
                    </span>
                  </label>

                  {/* Discover from server */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={discoverWorkflows}
                    disabled={loadingWorkflows}
                    className="h-7 px-2.5 text-xs gap-1"
                  >
                    {loadingWorkflows ? (
                      <Loader2 size={11} className="animate-spin" />
                    ) : (
                      <RefreshCw size={11} />
                    )}
                    Discover
                  </Button>
                </div>
              </div>

              {workflows.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-6 rounded-md border border-dashed border-border text-center">
                  <Server size={24} className="text-text-muted" />
                  <p className="text-xs text-text-muted">
                    No workflows loaded.{" "}
                    <button
                      type="button"
                      onClick={discoverWorkflows}
                      className="text-primary hover:underline"
                    >
                      Discover from server
                    </button>{" "}
                    or{" "}
                    <label className="text-primary hover:underline cursor-pointer">
                      import JSON files
                      <input
                        type="file"
                        accept=".json"
                        multiple
                        onChange={handleUploadWorkflow}
                        className="sr-only"
                      />
                    </label>
                    .
                  </p>
                </div>
              ) : (
                <div className="space-y-1">
                  {CATEGORY_ORDER.map((cat) => {
                    const catWorkflows = workflows.filter(
                      (w) => w.category === cat,
                    );
                    if (catWorkflows.length === 0) return null;
                    return (
                      <WorkflowGroup
                        key={cat}
                        category={cat}
                        workflows={catWorkflows}
                        onRemove={removeWorkflow}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

/* ── Workflow list group ──────────────────────────────────────── */

const CATEGORY_ORDER = [
  "image",
  "video",
  "audio",
  "upscaling",
  "enhancement",
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  image: "🖼️ Image Generation",
  video: "🎬 Video Generation",
  audio: "🎵 Audio Generation",
  upscaling: "🔍 Upscaling",
  enhancement: "✨ Enhancement",
};

function WorkflowGroup({
  category,
  workflows,
  onRemove,
}: {
  category: string;
  workflows: ComfyUIWorkflow[];
  onRemove: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-md border border-border overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 bg-background-secondary text-xs font-medium text-text-secondary hover:bg-background-tertiary transition-colors"
      >
        <span>{CATEGORY_LABELS[category] ?? category}</span>
        <span className="flex items-center gap-1 text-text-muted">
          {workflows.length}
          {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        </span>
      </button>

      {open && (
        <ul className="divide-y divide-border">
          {workflows.map((wf) => (
            <li
              key={wf.id}
              className="flex items-center justify-between px-3 py-2 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium text-text-primary truncate text-xs">
                  {wf.name}
                </p>
                {wf.description && (
                  <p className="text-[11px] text-text-muted truncate">
                    {wf.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => onRemove(wf.id)}
                className="ml-2 shrink-0 text-text-muted hover:text-error transition-colors"
                title="Remove workflow"
              >
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ── Helpers ──────────────────────────────────────────────────── */

function detectWorkflowCategory(
  schema: Record<string, unknown>,
): ComfyUIWorkflow["category"] {
  const json = JSON.stringify(schema).toLowerCase();

  if (
    json.includes("video") ||
    json.includes("ltx") ||
    json.includes("wan") ||
    json.includes("hunyuan")
  )
    return "video";
  if (
    json.includes("upscal") ||
    json.includes("esrgan") ||
    json.includes("realsr")
  )
    return "upscaling";
  if (json.includes("audio") || json.includes("tts") || json.includes("sound"))
    return "audio";
  if (
    json.includes("enhance") ||
    json.includes("restore") ||
    json.includes("face")
  )
    return "enhancement";

  return "image";
}
