import React, { useState, useEffect } from "react";
import {
  Mic,
  Loader2,
  Volume2,
  Settings,
  Sparkles,
  AlertTriangle,
  Workflow,
} from "@/icons/lucide-compat";
import { ToolcraftButton as Button } from "@openreel/ui";
import { ToolcraftCard as Card } from "@openreel/ui";
import { ToolcraftIconButton as IconButton } from "@openreel/ui";
import { ToolcraftText as Text } from "@openreel/ui";
import { ToolcraftTextAreaControl } from "@openreel/ui";
import { ToolcraftSelectControl as Selector } from "@openreel/ui";
import { MockToggle } from "./shell/InspectorControls";
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
    comfyuiHost,
    defaultLlmProvider,
    llmBaseUrl,
    llmModel,
    openSettings,
    settingsOpen,
    configuredServices,
    elevenLabsModel,
    favoriteVoices,
  } = useSettingsStore();

  const hasElevenLabsKey = configuredServices.includes("elevenlabs");

  const [provider, setProvider] = useState<TtsProvider>(
    defaultTtsProvider === "comfyui" ? "comfyui" : "elevenlabs",
  );
  const [text, setText] = useState("");
  const [selectedWorkflow, setSelectedWorkflow] = useState<string>("");
  const [audioWorkflows, setAudioWorkflows] = useState<Array<{ id: string; name: string }>>([]);
  const [isLoadingWorkflows, setIsLoadingWorkflows] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState<string>(
    favoriteVoices.length > 0 ? favoriteVoices[0].voiceId : "",
  );
  const [error, setError] = useState<string | null>(null);
  const [enhanceText, setEnhanceText] = useState(false);
  const [enhancedPreview, setEnhancedPreview] = useState<string | null>(null);

  const {
    allVoices,
    allModels,
    isLoadingVoices,
    isLoadingModels,
    generateWithElevenLabs,
    generateWithComfyUI,
    enhanceViaLlm,
  } = useElevenLabsApi({
    hasElevenLabsKey,
    settingsOpen,
    elevenLabsModel,
    defaultLlmProvider,
    llmBaseUrl,
    llmModel,
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
  } = useTtsActions({
    provider,
    selectedVoice,
    selectedWorkflow,
    text,
    enhanceText,
    enhancedPreview,
    allVoices,
    favoriteVoices,
    generateWithElevenLabs,
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

  const isComfyUI = provider === "comfyui";
  const generateDisabled =
    isGenerating ||
    !text.trim() ||
    (!isComfyUI && (!hasElevenLabsKey || !selectedVoice)) ||
    (isComfyUI && !selectedWorkflow) ||
    (!isComfyUI && enhanceText && !enhancedPreview);

  const charCount = text.length;
  const maxChars = 5000;

  return (
    <div className="space-y-3 w-full min-w-0 max-w-full">
      <audio ref={audioRef as React.RefObject<HTMLAudioElement>} onEnded={handleAudioEnded} className="hidden" />

      <Card
        variant="green"
        padding={2}
        className="flex items-center justify-between border border-primary/30"
      >
        <div className="flex items-center gap-2">
          <Mic size={16} className="text-primary" aria-hidden />
          <div className="flex flex-col gap-0.5 min-w-0">
            <Text type="body" color="primary" weight="bold" display="block" className="text-[11px]">
              Text to Speech
            </Text>
            <Text type="supporting" color="secondary" display="block" className="text-[9px]">
              {isComfyUI ? "Local ComfyUI audio workflows" : "User-keyed ElevenLabs voice generation"}
            </Text>
          </div>
        </div>
        <IconButton
          label="API Key Settings"
          icon={<Settings size={14} aria-hidden />}
          variant="ghost"
          size="sm"
          onClick={() => openSettings("api-keys")}
          className="text-fg-3 hover:text-fg"
        />
      </Card>

      {/* Provider selector */}
      <Selector
        label="Provider"
        size="md"
        width="100%"
        value={provider}
        onChange={(value) => setProvider(value as TtsProvider)}
        options={TTS_PROVIDERS.map((p) => ({ label: p.label, value: p.id }))}
      />

      {/* ComfyUI: workflow selector */}
      {isComfyUI && (
        <div className="space-y-2">
          <Text type="supporting" color="secondary" className="flex items-center gap-1 text-[10px]">
            <Workflow size={10} aria-hidden />
            Audio Workflow
          </Text>
          {isLoadingWorkflows ? (
            <div className="flex items-center gap-2 text-fg-3 text-[10px]">
              <Loader2 size={12} className="animate-spin" aria-hidden /> Loading workflows...
            </div>
          ) : audioWorkflows.length === 0 ? (
            <Card variant="yellow" padding={2} className="border border-amber-500/30">
              <Text type="supporting" className="text-[9px] text-amber-400">
                No audio workflows found. Add workflows with category "audio" in ComfyUI.
              </Text>
            </Card>
          ) : (
            <Selector
              label="Audio workflow"
              isLabelHidden
              size="md"
              width="100%"
              value={selectedWorkflow}
              onChange={(value) => setSelectedWorkflow(String(value))}
              options={audioWorkflows.map((w) => ({ label: w.name, value: w.id }))}
            />
          )}
        </div>
      )}

      {!isComfyUI && !hasElevenLabsKey && (
        <Card variant="yellow" padding={2} className="border border-amber-500/30">
          <Text type="supporting" className="text-[10px] text-amber-400">
            Add your ElevenLabs API key to enable speech generation. OpenReel no longer hosts a speech server.
          </Text>
        </Card>
      )}

      {!isComfyUI && hasElevenLabsKey && (
        <ModelSelector allModels={allModels} isLoadingModels={isLoadingModels} />
      )}

      <div className="space-y-2">
        <ToolcraftTextAreaControl
          label="Text"
          value={text}
          onChange={(value) => {
            setText(value);
            setEnhancedPreview(null);
          }}
          placeholder="Enter the text you want to convert to speech..."
          maxLength={maxChars}
          rows={4}
          width="100%"
        />
        <div className="flex items-center justify-between">
          {!isComfyUI ? (
          <div className="flex items-center gap-1.5">
            <MockToggle
              ariaLabel="Enhance for TTS"
              checked={enhanceText}
              onChange={setEnhanceText}
            />
            <Text
              type="supporting"
              color="secondary"
              className="flex items-center gap-1 text-[9px] cursor-pointer"
              onClick={() => setEnhanceText(!enhanceText)}
            >
              <Sparkles size={10} className={enhanceText ? "text-amber-400" : ""} aria-hidden />
              Enhance for TTS
            </Text>
          </div>
          ) : <div />}
          <Text
            type="supporting"
            className={`text-[9px] ${charCount > maxChars * 0.9 ? "text-red-400" : "text-fg-3"}`}
          >
            {charCount}/{maxChars}
          </Text>
        </div>

        {!isComfyUI && enhancedPreview && enhanceText && (
          <EnhancedTextPreview
            enhancedPreview={enhancedPreview}
            onUpdate={setEnhancedPreview}
            onDiscard={() => setEnhancedPreview(null)}
          />
        )}
      </div>

      {!isComfyUI && (
        <VoiceBrowser
          selectedVoice={selectedVoice}
          onSelectVoice={setSelectedVoice}
          allVoices={allVoices}
          isLoadingVoices={isLoadingVoices}
        />
      )}

      {error && (
        <Card
          variant="red"
          padding={2}
          className="flex items-center justify-between gap-2 border border-red-500/30"
        >
          <Text type="supporting" className="text-[10px] text-red-400">
            {error}
          </Text>
          {(error.includes("API key") || error.includes("Session locked") || error.includes("Unlock")) && (
            <Button
              label="Open Settings"
              variant="secondary"
              size="sm"
              onClick={() => openSettings("api-keys")}
              className="shrink-0 text-[9px]"
            />
          )}
        </Card>
      )}

      {successMsg && (
        <Card variant="green" padding={2} className="border border-green-500/30">
          <Text type="supporting" className="text-[10px] text-green-400">
            {successMsg}
          </Text>
        </Card>
      )}

      {!isComfyUI && enhanceText && !enhancedPreview && (
        <Button
          label={isEnhancing ? "Enhancing..." : "Enhance Text"}
          icon={
            isEnhancing ? (
              <Loader2 size={14} className="animate-spin" aria-hidden />
            ) : (
              <Sparkles size={14} aria-hidden />
            )
          }
          variant="primary"
          size="md"
          onClick={handleEnhance}
          isDisabled={isEnhancing || !text.trim()}
          isLoading={isEnhancing}
          className="w-full"
        />
      )}

      <Button
        label={isGenerating ? "Generating..." : "Generate Speech"}
        icon={
          isGenerating ? (
            <Loader2 size={14} className="animate-spin" aria-hidden />
          ) : (
            <Volume2 size={14} aria-hidden />
          )
        }
        variant="primary"
        size="md"
        onClick={generateSpeech}
        isDisabled={generateDisabled}
        isLoading={isGenerating}
        className="w-full"
      />

      {hasUnsavedAudio && (
        <Card
          variant="yellow"
          padding={2}
          className="flex items-center gap-1.5 border border-amber-500/30"
        >
          <AlertTriangle size={12} className="text-amber-400 shrink-0" aria-hidden />
          <Text type="supporting" className="text-[9px] text-amber-400">
            Unsaved audio — save to media, add to timeline, or download to keep it.
          </Text>
        </Card>
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

      <Text type="supporting" color="secondary" className="block text-[9px] text-center">
        {isComfyUI ? "Powered by ComfyUI (local)" : `Powered by ElevenLabs · ${getSelectedModelName()}`}
      </Text>
    </div>
  );
};

export default TextToSpeechPanel;
