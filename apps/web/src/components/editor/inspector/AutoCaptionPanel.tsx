import React, { useState, useCallback, useRef, useMemo } from "react";
import { Mic, MicOff, Languages, AlertCircle, FileAudio, Loader2, CheckCircle } from "lucide-react";
import { useEngineStore } from "../../../stores/engine-store";
import { useProjectStore } from "../../../stores/project-store";
import { useSettingsStore } from "../../../stores/settings-store";
import { SpeechToTextEngine } from "@openreel/core";
import type {
  TranscriptionProgress,
  TranscriptionSegment,
} from "@openreel/core";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@openreel/ui";

const CAPTION_STYLE_PRESETS = [
  { id: "default", name: "Default", description: "White text on dark background" },
  { id: "modern", name: "Modern", description: "Clean, minimal style" },
  { id: "bold", name: "Bold", description: "Large, impactful text" },
  { id: "cinematic", name: "Cinematic", description: "Film-style captions" },
  { id: "minimal", name: "Minimal", description: "Subtle, understated" },
];

type CaptionMode = "mic" | "whisperx";

export const AutoCaptionPanel: React.FC = () => {
  const getSpeechToTextEngine = useEngineStore((state) => state.getSpeechToTextEngine);
  const addSubtitle = useProjectStore((state) => state.addSubtitle);
  const applySubtitleStylePreset = useProjectStore((state) => state.applySubtitleStylePreset);
  const { whisperxBaseUrl, whisperxModel, whisperxLanguage } = useSettingsStore();

  const [mode, setMode] = useState<CaptionMode>("mic");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [progress, setProgress] = useState<TranscriptionProgress | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState("en-US");
  const [selectedStyle, setSelectedStyle] = useState("default");
  const [segments, setSegments] = useState<TranscriptionSegment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [whisperxStatus, setWhisperxStatus] = useState<"idle" | "uploading" | "transcribing" | "done">("idle");
  const [whisperxResult, setWhisperxResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isMicSupported = useMemo(() => SpeechToTextEngine.isSupported(), []);
  const languages = useMemo(() => SpeechToTextEngine.getSupportedLanguages(), []);

  // ── Mic mode handlers ──────────────────────────────────────────────────────

  const handleStartTranscription = useCallback(async () => {
    setError(null);
    setSegments([]);
    setIsTranscribing(true);
    try {
      const speechEngine = await getSpeechToTextEngine();
      speechEngine.setOptions({ language: selectedLanguage });
      speechEngine.onProgress((prog) => setProgress(prog));
      speechEngine.onSegment((segment) => setSegments((prev) => [...prev, segment]));
      await speechEngine.startLiveTranscription();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to start transcription");
      setIsTranscribing(false);
    }
  }, [getSpeechToTextEngine, selectedLanguage]);

  const handleStopTranscription = useCallback(async () => {
    const speechEngine = await getSpeechToTextEngine();
    const result = speechEngine.stopTranscription();
    setIsTranscribing(false);
    setProgress(null);
    if (result.success && result.segments.length > 0) {
      const subtitles = speechEngine.segmentsToSubtitles(result.segments);
      subtitles.forEach((subtitle) => addSubtitle(subtitle));
      if (selectedStyle !== "default") await applySubtitleStylePreset(selectedStyle);
    }
  }, [getSpeechToTextEngine, addSubtitle, applySubtitleStylePreset, selectedStyle]);

  const handleApplySegments = useCallback(async () => {
    if (segments.length === 0) return;
    const speechEngine = await getSpeechToTextEngine();
    const subtitles = speechEngine.segmentsToSubtitles(segments);
    subtitles.forEach((subtitle) => addSubtitle(subtitle));
    if (selectedStyle !== "default") await applySubtitleStylePreset(selectedStyle);
    setSegments([]);
  }, [getSpeechToTextEngine, addSubtitle, applySubtitleStylePreset, segments, selectedStyle]);

  // ── WhisperX mode handlers ─────────────────────────────────────────────────

  const handleWhisperxTranscribe = useCallback(async (file: File) => {
    setError(null);
    setWhisperxResult(null);
    setWhisperxStatus("uploading");

    try {
      const formData = new FormData();
      formData.append("audio", file);
      formData.append("model", whisperxModel);
      formData.append("language", whisperxLanguage || selectedLanguage.split("-")[0]);

      const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
      const url = isHttps
        ? `/api/proxy/whisperx/transcribe?host=${encodeURIComponent(whisperxBaseUrl)}`
        : `${whisperxBaseUrl.replace(/\/$/, "")}/api/transcribe`;

      setWhisperxStatus("transcribing");
      const res = await fetch(url, { method: "POST", body: formData });

      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as Record<string, unknown>;
        throw new Error(String(err.error ?? err.detail ?? `WhisperX error (${res.status})`));
      }

      const data = await res.json() as {
        text?: string;
        segments?: Array<{ start: number; end: number; text: string }>;
      };

      // Add subtitles from word-level segments
      if (data.segments?.length) {
        data.segments.forEach(({ start, end, text }) => {
          addSubtitle({
            id: `wx-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            startTime: start,
            endTime: end,
            text: text.trim(),
          } as Parameters<typeof addSubtitle>[0]);
        });
        if (selectedStyle !== "default") await applySubtitleStylePreset(selectedStyle);
      }

      setWhisperxResult(data.text ?? "Transcription complete");
      setWhisperxStatus("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "WhisperX transcription failed");
      setWhisperxStatus("idle");
    }
  }, [whisperxBaseUrl, whisperxModel, whisperxLanguage, selectedLanguage, addSubtitle, applySubtitleStylePreset, selectedStyle]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleWhisperxTranscribe(file);
    e.target.value = "";
  }, [handleWhisperxTranscribe]);

  return (
    <div className="space-y-4 w-full min-w-0 max-w-full">
      <div className="flex items-center gap-2 p-2 bg-primary/10 rounded-lg border border-primary/30">
        <Mic size={16} className="text-primary" />
        <div>
          <span className="text-[11px] font-medium text-text-primary">Auto-Caption</span>
          <p className="text-[9px] text-text-muted">Generate captions from speech</p>
        </div>
      </div>

      {/* Mode toggle */}
      <div className="flex gap-1.5">
        <button
          onClick={() => setMode("mic")}
          className={`flex-1 px-2 py-1.5 rounded-lg text-[10px] transition-colors ${
            mode === "mic"
              ? "bg-primary text-white font-medium"
              : "bg-background-tertiary text-text-secondary hover:text-text-primary border border-border"
          }`}
        >
          Microphone
        </button>
        <button
          onClick={() => setMode("whisperx")}
          className={`flex-1 px-2 py-1.5 rounded-lg text-[10px] transition-colors ${
            mode === "whisperx"
              ? "bg-primary text-white font-medium"
              : "bg-background-tertiary text-text-secondary hover:text-text-primary border border-border"
          }`}
          title="Transcribe audio/video file via WhisperX"
        >
          WhisperX (File)
        </button>
      </div>

      {/* Common: language + style */}
      <div className="space-y-3 p-3 bg-background-tertiary rounded-lg">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Languages size={14} className="text-text-secondary" />
            <span className="text-[10px] text-text-secondary">Language</span>
          </div>
          <Select
            value={selectedLanguage}
            onValueChange={setSelectedLanguage}
            disabled={isTranscribing || whisperxStatus === "transcribing"}
          >
            <SelectTrigger className="w-auto min-w-[100px] bg-background-secondary border-border text-text-primary text-[10px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-background-secondary border-border">
              {languages.map((lang) => (
                <SelectItem key={lang.code} value={lang.code}>{lang.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-[10px] text-text-secondary">Caption Style</span>
          <Select
            value={selectedStyle}
            onValueChange={setSelectedStyle}
            disabled={isTranscribing || whisperxStatus === "transcribing"}
          >
            <SelectTrigger className="w-auto min-w-[100px] bg-background-secondary border-border text-text-primary text-[10px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-background-secondary border-border">
              {CAPTION_STYLE_PRESETS.map((preset) => (
                <SelectItem key={preset.id} value={preset.id}>{preset.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-2 bg-red-500/10 border border-red-500/30 rounded-lg">
          <AlertCircle size={14} className="text-red-400" />
          <span className="text-[10px] text-red-400">{error}</span>
        </div>
      )}

      {/* ── MIC MODE ── */}
      {mode === "mic" && (
        <>
          {!isMicSupported && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <div className="flex items-center gap-2 text-amber-400 mb-1">
                <AlertCircle size={14} />
                <span className="text-[10px] font-medium">Browser Not Supported</span>
              </div>
              <p className="text-[9px] text-text-muted">
                Microphone captions require Chrome or Edge. Use WhisperX (File) to transcribe clips instead.
              </p>
            </div>
          )}

          {isTranscribing && progress && (
            <div className="space-y-2 p-3 bg-background-tertiary rounded-lg">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-text-secondary">Status</span>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-[10px] text-red-400">Recording</span>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-text-secondary">Segments Found</span>
                <span className="text-[10px] text-text-primary font-mono">{progress.segmentsFound}</span>
              </div>
            </div>
          )}

          {segments.length > 0 && !isTranscribing && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-text-secondary">
                  {segments.length} caption{segments.length !== 1 ? "s" : ""} detected
                </span>
                <button
                  onClick={handleApplySegments}
                  className="px-2 py-1 text-[10px] bg-primary text-white rounded hover:bg-primary/80 transition-colors"
                >
                  Add to Timeline
                </button>
              </div>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {segments.map((segment, index) => (
                  <div key={index} className="p-2 bg-background-secondary rounded text-[10px] text-text-primary">
                    <span className="text-text-muted font-mono">
                      [{segment.startTime.toFixed(1)}s - {segment.endTime.toFixed(1)}s]
                    </span>
                    <span className="ml-2">{segment.text}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            {!isTranscribing ? (
              <button
                onClick={handleStartTranscription}
                disabled={!isMicSupported}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Mic size={16} />
                <span className="text-[11px] font-medium">Start Recording</span>
              </button>
            ) : (
              <button
                onClick={handleStopTranscription}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 text-white rounded-lg hover:bg-red-600 transition-colors"
              >
                <MicOff size={16} />
                <span className="text-[11px] font-medium">Stop Recording</span>
              </button>
            )}
          </div>

          <p className="text-[9px] text-text-muted text-center">
            Speak clearly into your microphone. Captions will be generated in real-time.
          </p>
        </>
      )}

      {/* ── WHISPERX MODE ── */}
      {mode === "whisperx" && (
        <>
          <div className="p-3 bg-background-tertiary rounded-lg space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-text-secondary">Model</span>
              <span className="text-[10px] text-text-primary font-mono">{whisperxModel}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] text-text-secondary">Endpoint</span>
              <span className="text-[9px] text-text-muted truncate max-w-[120px]" title={whisperxBaseUrl}>
                {whisperxBaseUrl.replace(/^https?:\/\//, "")}
              </span>
            </div>
          </div>

          {whisperxStatus === "done" && whisperxResult && (
            <div className="flex items-start gap-2 p-2 bg-green-500/10 border border-green-500/30 rounded-lg">
              <CheckCircle size={14} className="text-green-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] text-green-400 font-medium">Captions added to timeline</p>
                <p className="text-[9px] text-text-muted mt-0.5 line-clamp-2">{whisperxResult}</p>
              </div>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            accept="audio/*,video/*"
            onChange={handleFileChange}
            className="hidden"
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={whisperxStatus === "uploading" || whisperxStatus === "transcribing"}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {whisperxStatus === "uploading" || whisperxStatus === "transcribing" ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span className="text-[11px] font-medium">
                  {whisperxStatus === "uploading" ? "Uploading..." : "Transcribing..."}
                </span>
              </>
            ) : (
              <>
                <FileAudio size={16} />
                <span className="text-[11px] font-medium">Select Audio / Video File</span>
              </>
            )}
          </button>

          <p className="text-[9px] text-text-muted text-center">
            Powered by WhisperX · {whisperxModel} · Configure in Settings → Local Providers
          </p>
        </>
      )}
    </div>
  );
};

export default AutoCaptionPanel;
