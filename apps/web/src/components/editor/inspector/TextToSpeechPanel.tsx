import React, { useState, useCallback, useEffect } from "react";
import {
  Mic,
  Loader2,
  Volume2,
  Settings,
  Sparkles,
  AlertTriangle,
  Workflow,
} from "lucide-react";
import { Slider, Switch } from "@openreel/ui";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@openreel/ui";
import { toast } from "../../../stores/notification-store";
import { useSettingsStore, type TtsProvider } from "../../../stores/settings-store";
import { useElevenLabsApi } from "./hooks/useElevenLabsApi";
import { useTtsActions } from "./hooks/useTtsActions";
import { VoiceBrowser } from "./VoiceBrowser";
import { ModelSelector } from "./ModelSelector";
import { EnhancedTextPreview } from "./EnhancedTextPreview";
import { AudioResult } from "./AudioResult";
import { TTS_PROVIDERS } from "./tts-constants";

export const TextToSpeechPanel: React.FC = () => {
  const {
    defaultTtsProvider,
    defaultLlmProvider,
    openSettings,
    settingsOpen,
    configuredServices,
    elevenLabsModel,
    favoriteVoices,
    comfyuiHost,
  } = useSettingsStore();

  const hasElevenLabsKey = configuredServices.includes("elevenlabs");

  const defaultProvider: TtsProvider =
    defaultTtsProvider === "elevenlabs" && hasElevenLabsKey
      ? "elevenlabs"
      : defaultTtsProvider === "comfyui"
        ? "comfyui"
        : "piper";

  const [provider, setProvider] = useState<TtsProvider>(defaultProvider);
  const [text, setText] = useState("");
  const [selectedVoice, setSelectedVoice] = useState<string>(
    defaultProvider === "elevenlabs" && favoriteVoices.length > 0
      ? favoriteVoices[0].voiceId
      : "amy",
  );
  const [selectedWorkflow, setSelectedWorkflow] = useState<string>("");
  const [audioWorkflows, setAudioWorkflows] = useState<Array<{ id: string; name: string }>>([]);
  const [isLoadingWorkflows, setIsLoadingWorkflows] = useState(false);
  const [speed, setSpeed] = useState(1.0);
  const [error, setError] = useState<string | null>(null);
  const [enhanceText, setEnhanceText] = useState(false);
  const [enhancedPreview, setEnhancedPreview] = useState<string | null>(null);

  const {
    allVoices,
    allModels,
    isLoadingVoices,
    isLoadingModels,
    generateWithElevenLabs,
    generateWithPiper,
    generateWithComfyUI,
    enhanceViaLlm,
  } = useElevenLabsApi({
    provider,
    hasElevenLabsKey,
    settingsOpen,
    elevenLabsModel,
    defaultLlmProvider,
  });

  // Load ComfyUI audio workflows when provider switches to comfyui
  useEffect(() => {
    if (provider !== "comfyui") return;
    setIsLoadingWorkflows(true);
    const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
    const url = isHttps
      ? `/api/proxy/comfyui/workflows?host=${encodeURIComponent(comfyuiHost)}`
      : `${comfyuiHost.replace(/\/$/, "")}/openreel/workflows`;

    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        const list = (data as Array<{ id: string; name: string; category?: string }>)
          .filter((w) => w.category === "audio" || !w.category);
        setAudioWorkflows(list);
        if (list.length > 0 && !selectedWorkflow) setSelectedWorkflow(list[0].id);
      })
      .catch(() => setAudioWorkflows([]))
      .finally(() => setIsLoadingWorkflows(false));
  }, [provider, comfyuiHost, selectedWorkflow]);

  const {
    isGenerating,
    isPlaying,
    isEnhancing,
    generatedAudio,
    hasUnsavedAudio,
    successMsg,
    audioRef,
    getSelectedVoiceName,
    handleEnhance,
    generateSpeech,
    togglePlayback,
    handleAudioEnded,
    saveToMedia,
    addToTimeline,
    downloadAudio,
    setGeneratedAudio,
  } = useTtsActions({
    provider,
    selectedVoice,
    selectedWorkflow,
    text,
    speed,
    enhanceText,
    enhancedPreview,
    allVoices,
    favoriteVoices,
    generateWithElevenLabs,
    generateWithPiper,
    generateWithComfyUI,
    enhanceViaLlm,
    setText,
    setError,
    setEnhancedPreview,
  });

  const getSelectedModelName = (): string => {
    const model = allModels.find((m) => m.model_id === elevenLabsModel);
    if (model) return model.name;
    return elevenLabsModel;
  };

  const warnUnsavedAudio = useCallback(() => {
    if (hasUnsavedAudio) {
      toast.warning("Unsaved audio discarded", "Save to media or download next time to keep it.");
    }
  }, [hasUnsavedAudio]);

  const handleProviderSwitch = useCallback((newProvider: TtsProvider) => {
    if (newProvider === provider) return;
    warnUnsavedAudio();
    setProvider(newProvider);
    setSelectedVoice(
      newProvider === "elevenlabs"
        ? (favoriteVoices.length > 0 ? favoriteVoices[0].voiceId : "")
        : "amy",
    );
    setGeneratedAudio(null);
  }, [provider, warnUnsavedAudio, favoriteVoices, setGeneratedAudio]);

  const charCount = text.length;
  const maxChars = 5000;

  const isComfyUIReady = provider === "comfyui" && selectedWorkflow;
  const generateDisabled =
    isGenerating ||
    !text.trim() ||
    (provider === "elevenlabs" && !selectedVoice) ||
    (provider === "comfyui" && !isComfyUIReady) ||
    (enhanceText && provider === "elevenlabs" && !enhancedPreview);

  return (
    <div className="space-y-3 w-full min-w-0 max-w-full">
      <audio ref={audioRef as React.RefObject<HTMLAudioElement>} onEnded={handleAudioEnded} className="hidden" />

      <div className="flex items-center justify-between p-2 bg-primary/10 rounded-lg border border-primary/30">
        <div className="flex items-center gap-2">
          <Mic size={16} className="text-primary" />
          <div>
            <span className="text-[11px] font-medium text-text-primary">Text to Speech</span>
            <p className="text-[9px] text-text-muted">AI voice generation</p>
          </div>
        </div>
        <button
          onClick={() => openSettings("api-keys")}
          className="p-1.5 rounded-md hover:bg-background-tertiary text-text-muted hover:text-text-primary transition-colors"
          title="API Key Settings"
        >
          <Settings size={14} />
        </button>
      </div>

      {/* Provider selector */}
      <div className="space-y-2">
        <label className="text-[10px] font-medium text-text-secondary">Provider</label>
        <div className="flex gap-1.5 flex-wrap">
          {TTS_PROVIDERS.map((p) => {
            const isDisabled = p.id === "elevenlabs" && !hasElevenLabsKey;
            return (
              <button
                key={p.id}
                onClick={() => {
                  if (isDisabled) { openSettings("api-keys"); return; }
                  handleProviderSwitch(p.id);
                }}
                className={`flex-1 px-2 py-1.5 rounded-lg text-[10px] transition-colors min-w-[70px] ${
                  provider === p.id
                    ? "bg-primary text-white font-medium"
                    : isDisabled
                      ? "bg-background-tertiary text-text-muted border border-border opacity-60 cursor-default"
                      : "bg-background-tertiary text-text-secondary hover:text-text-primary border border-border"
                }`}
                title={isDisabled ? "Add ElevenLabs API key in Settings" : p.description}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      </div>

      {provider === "elevenlabs" && hasElevenLabsKey && (
        <ModelSelector allModels={allModels} isLoadingModels={isLoadingModels} />
      )}

      {/* ComfyUI: workflow selector */}
      {provider === "comfyui" && (
        <div className="space-y-2">
          <label className="text-[10px] font-medium text-text-secondary flex items-center gap-1">
            <Workflow size={10} />
            Audio Workflow
          </label>
          {isLoadingWorkflows ? (
            <div className="flex items-center gap-2 text-text-muted text-[10px]">
              <Loader2 size={12} className="animate-spin" /> Loading workflows...
            </div>
          ) : audioWorkflows.length === 0 ? (
            <p className="text-[9px] text-amber-400 p-2 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              No audio workflows found. Add workflows with category "audio" in ComfyUI.
            </p>
          ) : (
            <Select value={selectedWorkflow} onValueChange={setSelectedWorkflow}>
              <SelectTrigger className="w-full bg-background-secondary border-border text-text-primary text-[10px]">
                <SelectValue placeholder="Select a workflow" />
              </SelectTrigger>
              <SelectContent className="bg-background-secondary border-border">
                {audioWorkflows.map((w) => (
                  <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      {/* Text input */}
      <div className="space-y-2">
        <label className="text-[10px] font-medium text-text-secondary">Text</label>
        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setEnhancedPreview(null); }}
          placeholder="Enter the text you want to convert to speech..."
          className="w-full h-24 px-3 py-2 text-[11px] bg-background-tertiary rounded-lg border border-border focus:border-primary focus:outline-none resize-none"
          maxLength={maxChars}
        />
        <div className="flex items-center justify-between">
          {provider === "elevenlabs" ? (
            <div className="flex items-center gap-1.5">
              <Switch checked={enhanceText} onCheckedChange={setEnhanceText} className="scale-75 origin-left" />
              <label className="text-[9px] text-text-muted flex items-center gap-1 cursor-pointer" onClick={() => setEnhanceText(!enhanceText)}>
                <Sparkles size={10} className={enhanceText ? "text-amber-400" : ""} />
                Enhance for TTS
              </label>
            </div>
          ) : (
            <div />
          )}
          <span className={`text-[9px] ${charCount > maxChars * 0.9 ? "text-red-400" : "text-text-muted"}`}>
            {charCount}/{maxChars}
          </span>
        </div>

        {enhancedPreview && enhanceText && (
          <EnhancedTextPreview
            enhancedPreview={enhancedPreview}
            onUpdate={setEnhancedPreview}
            onDiscard={() => setEnhancedPreview(null)}
          />
        )}
      </div>

      {provider !== "comfyui" && (
        <VoiceBrowser
          provider={provider}
          selectedVoice={selectedVoice}
          onSelectVoice={setSelectedVoice}
          allVoices={allVoices}
          isLoadingVoices={isLoadingVoices}
        />
      )}

      {provider === "piper" && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-medium text-text-secondary">Speed</label>
            <span className="text-[10px] text-text-muted">{speed.toFixed(1)}x</span>
          </div>
          <Slider min={0.5} max={2.0} step={0.1} value={[speed]} onValueChange={(value) => setSpeed(value[0])} />
          <div className="flex justify-between text-[8px] text-text-muted">
            <span>0.5x</span><span>1.0x</span><span>2.0x</span>
          </div>
        </div>
      )}

      {error && (
        <div className="p-2 bg-red-500/10 border border-red-500/30 rounded-lg flex items-center justify-between gap-2">
          <p className="text-[10px] text-red-400">{error}</p>
          {(error.includes("API key") || error.includes("Session locked") || error.includes("Unlock")) && (
            <button
              onClick={() => openSettings("api-keys")}
              className="shrink-0 px-2 py-1 rounded text-[9px] font-medium bg-red-500/20 text-red-300 hover:bg-red-500/30 transition-colors"
            >
              Open Settings
            </button>
          )}
        </div>
      )}

      {successMsg && (
        <div className="p-2 bg-green-500/10 border border-green-500/30 rounded-lg">
          <p className="text-[10px] text-green-400">{successMsg}</p>
        </div>
      )}

      {enhanceText && provider === "elevenlabs" && !enhancedPreview && (
        <button
          onClick={handleEnhance}
          disabled={isEnhancing || !text.trim()}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 text-white rounded-lg text-[11px] font-medium transition-all hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isEnhancing ? (
            <><Loader2 size={14} className="animate-spin" /> Enhancing...</>
          ) : (
            <><Sparkles size={14} /> Enhance Text</>
          )}
        </button>
      )}

      <button
        onClick={generateSpeech}
        disabled={generateDisabled}
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-[11px] font-medium transition-all hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isGenerating ? (
          <><Loader2 size={14} className="animate-spin" /> Generating...</>
        ) : (
          <><Volume2 size={14} /> Generate Speech</>
        )}
      </button>

      {hasUnsavedAudio && (
        <div className="flex items-center gap-1.5 px-2 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <AlertTriangle size={12} className="text-amber-400 shrink-0" />
          <p className="text-[9px] text-amber-400">
            Unsaved audio — save to media, add to timeline, or download to keep it.
          </p>
        </div>
      )}

      {generatedAudio && (
        <AudioResult
          generatedAudio={generatedAudio}
          voiceName={getSelectedVoiceName()}
          isPlaying={isPlaying}
          isGenerating={isGenerating}
          onTogglePlayback={togglePlayback}
          onSaveToMedia={saveToMedia}
          onAddToTimeline={addToTimeline}
          onDownload={downloadAudio}
        />
      )}

      <p className="text-[9px] text-text-muted text-center">
        Powered by{" "}
        {provider === "elevenlabs"
          ? `ElevenLabs · ${getSelectedModelName()}`
          : provider === "comfyui"
            ? "ComfyUI (local)"
            : "Piper TTS"}
      </p>
    </div>
  );
};

export default TextToSpeechPanel;
