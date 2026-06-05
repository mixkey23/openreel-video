import React, { useState, useCallback, useRef, useMemo } from "react";
import { Mic, MicOff, Languages, AlertCircle, Captions, Loader2, CheckCircle, ChevronRight, AudioLines, Film } from "lucide-react";
import { useEngineStore } from "../../../stores/engine-store";
import { useProjectStore } from "../../../stores/project-store";
import { useSettingsStore } from "../../../stores/settings-store";
import { SpeechToTextEngine } from "@openreel/core";
import type { TranscriptionProgress, TranscriptionSegment } from "@openreel/core";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@openreel/ui";
import { groupWordsToSubtitles } from "../../../utils/captions-track";

const CAPTION_STYLE_PRESETS = [
  { id: "default",   name: "Default",   description: "White text on dark background" },
  { id: "modern",    name: "Modern",    description: "Clean, minimal style" },
  { id: "bold",      name: "Bold",      description: "Large, impactful text" },
  { id: "cinematic", name: "Cinematic", description: "Film-style captions" },
  { id: "minimal",   name: "Minimal",   description: "Subtle, understated" },
];

const WHISPER_LANGUAGES = [
  { code: "en",   name: "English" },
  { code: "es",   name: "Spanish" },
  { code: "fr",   name: "French" },
  { code: "de",   name: "German" },
  { code: "it",   name: "Italian" },
  { code: "pt",   name: "Portuguese" },
  { code: "ru",   name: "Russian" },
  { code: "zh",   name: "Chinese" },
  { code: "ja",   name: "Japanese" },
  { code: "ko",   name: "Korean" },
  { code: "ar",   name: "Arabic" },
  { code: "hi",   name: "Hindi" },
  { code: "nl",   name: "Dutch" },
  { code: "pl",   name: "Polish" },
  { code: "tr",   name: "Turkish" },
  { code: "auto", name: "Auto-detect" },
];

function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

type CaptionMode = "mic" | "timeline";

export const AutoCaptionPanel: React.FC = () => {
  const getSpeechToTextEngine      = useEngineStore((state) => state.getSpeechToTextEngine);
  const addSubtitle                = useProjectStore((state) => state.addSubtitle);
  const applySubtitleStylePreset   = useProjectStore((state) => state.applySubtitleStylePreset);
  const project                    = useProjectStore((state) => state.project);
  const { whisperxModel }          = useSettingsStore();

  const timelineDuration = project?.timeline?.duration ?? 0;
  const audioTracks = useMemo(
    () => project?.timeline?.tracks?.filter((t) => t.type === "audio") ?? [],
    [project?.timeline?.tracks]
  );
  const videoTracks = useMemo(
    () => project?.timeline?.tracks?.filter((t) => t.type === "video") ?? [],
    [project?.timeline?.tracks]
  );

  const [mode, setMode]                         = useState<CaptionMode>("mic");
  const [isTranscribing, setIsTranscribing]     = useState(false);
  const [progress, setProgress]                 = useState<TranscriptionProgress | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState("en-US");
  const [selectedStyle, setSelectedStyle]       = useState("default");
  const [segments, setSegments]                 = useState<TranscriptionSegment[]>([]);
  const [error, setError]                       = useState<string | null>(null);

  // Timeline transcription state
  const [tlStatus, setTlStatus]               = useState<"idle" | "transcribing" | "done">("idle");
  const [tlRangeStart, setTlRangeStart]       = useState(0);
  const [tlRangeEnd, setTlRangeEnd]           = useState(0);
  const [tlLang, setTlLang]                   = useState("auto");
  const [tlTranslate, setTlTranslate]         = useState(false);
  const [tlTargetLang, setTlTargetLang]       = useState("en");
  const [tlResult, setTlResult]               = useState<string | null>(null);
  const [tlAudioSource, setTlAudioSource]     = useState<"audio-tracks" | "video-tracks">("audio-tracks");
  const [tlAudioTrackId, setTlAudioTrackId]   = useState("all");
  const [tlVideoTrackId, setTlVideoTrackId]   = useState("all");
  const abortRef = useRef<AbortController | null>(null);

  React.useEffect(() => {
    if (tlRangeEnd === 0 && timelineDuration > 0) {
      setTlRangeEnd(Math.floor(timelineDuration));
    }
  }, [timelineDuration, tlRangeEnd]);

  // ── Mic mode ──────────────────────────────────────────────────────────────

  const isMicSupported = useMemo(() => SpeechToTextEngine.isSupported(), []);
  const languages      = useMemo(() => SpeechToTextEngine.getSupportedLanguages(), []);

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

  // ── Timeline transcription ─────────────────────────────────────────────────

  const handleTimelineTranscribe = useCallback(async () => {
    if (!project) return;
    setError(null);
    setTlResult(null);

    const rangeStart = tlRangeStart;
    const rangeEnd   = tlRangeEnd > tlRangeStart ? tlRangeEnd : timelineDuration;

    // Collect clips to transcribe based on source mode
    const clipsToTranscribe: Array<{ blob: Blob; startTime: number; duration: number }> = [];

    if (tlAudioSource === "audio-tracks") {
      for (const track of project.timeline.tracks) {
        if (track.type !== "audio" || track.muted) continue;
        if (tlAudioTrackId !== "all" && track.id !== tlAudioTrackId) continue;
        for (const clip of track.clips) {
          const overlapStart = Math.max(clip.startTime, rangeStart);
          const overlapEnd   = Math.min(clip.startTime + clip.duration, rangeEnd);
          if (overlapEnd - overlapStart < 0.05) continue;
          const mi = (project as unknown as {
            mediaLibrary?: { items?: Array<{ id: string; blob: Blob | null; name: string }> };
          }).mediaLibrary?.items?.find((m) => m.id === clip.mediaId);
          if (mi?.blob) clipsToTranscribe.push({ blob: mi.blob, startTime: clip.startTime, duration: clip.duration });
        }
      }
    } else {
      // video-tracks: extract audio from video files
      for (const track of project.timeline.tracks) {
        if (track.type !== "video") continue;
        if (tlVideoTrackId !== "all" && track.id !== tlVideoTrackId) continue;
        for (const clip of track.clips) {
          const overlapStart = Math.max(clip.startTime, rangeStart);
          const overlapEnd   = Math.min(clip.startTime + clip.duration, rangeEnd);
          if (overlapEnd - overlapStart < 0.05) continue;
          const mi = (project as unknown as {
            mediaLibrary?: { items?: Array<{ id: string; blob: Blob | null; name: string }> };
          }).mediaLibrary?.items?.find((m) => m.id === clip.mediaId);
          if (mi?.blob) clipsToTranscribe.push({ blob: mi.blob, startTime: clip.startTime, duration: clip.duration });
        }
      }
    }

    if (clipsToTranscribe.length === 0) {
      setError(`No ${tlAudioSource === "audio-tracks" ? "audio" : "video"} clips found in the selected range.`);
      return;
    }

    clipsToTranscribe.sort((a, b) => a.startTime - b.startTime);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setTlStatus("transcribing");

    try {
      let totalSubtitles = 0;

      for (let i = 0; i < clipsToTranscribe.length; i++) {
        if (controller.signal.aborted) break;

        const clip = clipsToTranscribe[i];
        const formData = new FormData();
        formData.append("audio", clip.blob, "audio.wav");
        formData.append("language", tlLang === "auto" ? "" : tlLang);
        formData.append("target_language", tlTranslate ? tlTargetLang : "");
        formData.append("model", whisperxModel);

        const res = await fetch("/api/transcribe", {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });

        if (!res.ok) {
          console.warn(`[AutoCaption] Clip ${i + 1} failed: HTTP ${res.status}`);
          continue;
        }

        const data = await res.json() as {
          text: string;
          words: Array<{ word: string; start: number; end: number }>;
        };

        const blocks = groupWordsToSubtitles(data.words, clip.startTime);

        if (blocks.length === 0 && data.text?.trim()) {
          const lastWordEnd = data.words?.length
            ? clip.startTime + data.words[data.words.length - 1].end
            : clip.startTime + clip.duration;
          addSubtitle({
            id:        `tl-${Date.now()}-${i}-0`,
            text:      data.text.trim(),
            startTime: clip.startTime,
            endTime:   lastWordEnd,
          } as Parameters<typeof addSubtitle>[0]);
          totalSubtitles++;
        } else {
          for (let j = 0; j < blocks.length; j++) {
            addSubtitle({
              id: `tl-${Date.now()}-${i}-${j}`,
              ...blocks[j],
            } as Parameters<typeof addSubtitle>[0]);
          }
          totalSubtitles += blocks.length;
        }
      }

      if (selectedStyle !== "default") await applySubtitleStylePreset(selectedStyle);

      setTlResult(`${totalSubtitles} caption${totalSubtitles !== 1 ? "s" : ""} added`);
      setTlStatus("done");
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Transcription failed");
      setTlStatus("idle");
    }
  }, [
    project, tlRangeStart, tlRangeEnd, tlLang, tlTranslate, tlTargetLang,
    tlAudioSource, tlAudioTrackId, tlVideoTrackId,
    whisperxModel, timelineDuration, addSubtitle, applySubtitleStylePreset, selectedStyle,
  ]);

  const isTimelineBusy = tlStatus === "transcribing";

  return (
    <div className="space-y-4 w-full min-w-0 max-w-full">
      <div className="flex items-center gap-2 p-2 bg-primary/10 rounded-lg border border-primary/30">
        <Captions size={16} className="text-primary" />
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
          onClick={() => setMode("timeline")}
          className={`flex-1 px-2 py-1.5 rounded-lg text-[10px] transition-colors ${
            mode === "timeline"
              ? "bg-primary text-white font-medium"
              : "bg-background-tertiary text-text-secondary hover:text-text-primary border border-border"
          }`}
        >
          Transcribe Clips
        </button>
      </div>

      {/* Common: style */}
      <div className="space-y-2 p-3 bg-background-tertiary rounded-lg">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-text-secondary">Caption Style</span>
          <Select value={selectedStyle} onValueChange={setSelectedStyle} disabled={isTranscribing || isTimelineBusy}>
            <SelectTrigger className="w-auto min-w-[110px] bg-background-secondary border-border text-text-primary text-[10px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-background-secondary border-border">
              {CAPTION_STYLE_PRESETS.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-2 bg-red-500/10 border border-red-500/30 rounded-lg">
          <AlertCircle size={14} className="text-red-400 shrink-0" />
          <span className="text-[10px] text-red-400">{error}</span>
        </div>
      )}

      {/* ── MIC MODE ── */}
      {mode === "mic" && (
        <>
          <div className="space-y-2 p-3 bg-background-tertiary rounded-lg">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Languages size={14} className="text-text-secondary" />
                <span className="text-[10px] text-text-secondary">Language</span>
              </div>
              <Select value={selectedLanguage} onValueChange={setSelectedLanguage} disabled={isTranscribing}>
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
          </div>

          {!isMicSupported && (
            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
              <div className="flex items-center gap-2 text-amber-400 mb-1">
                <AlertCircle size={14} />
                <span className="text-[10px] font-medium">Browser Not Supported</span>
              </div>
              <p className="text-[9px] text-text-muted">
                Microphone captions require Chrome or Edge. Use "Transcribe Clips" instead.
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
                <span className="text-[10px] text-text-secondary">Segments</span>
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
                      [{segment.startTime.toFixed(1)}s–{segment.endTime.toFixed(1)}s]
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
            Speak clearly into your microphone. Captions generated in real-time.
          </p>
        </>
      )}

      {/* ── TIMELINE TRANSCRIPTION MODE ── */}
      {mode === "timeline" && (
        <>
          {/* Audio source toggle */}
          <div className="p-3 bg-background-tertiary rounded-lg space-y-3">
            <label className="text-[10px] font-medium text-text-secondary block">Audio Source</label>
            <div className="flex gap-1">
              <button
                onClick={() => setTlAudioSource("audio-tracks")}
                disabled={isTimelineBusy}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] transition-colors ${
                  tlAudioSource === "audio-tracks"
                    ? "bg-primary text-white font-medium"
                    : "bg-background-secondary text-text-secondary border border-border hover:text-text-primary"
                }`}
              >
                <AudioLines size={11} />
                Audio Tracks
              </button>
              <button
                onClick={() => setTlAudioSource("video-tracks")}
                disabled={isTimelineBusy}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[10px] transition-colors ${
                  tlAudioSource === "video-tracks"
                    ? "bg-primary text-white font-medium"
                    : "bg-background-secondary text-text-secondary border border-border hover:text-text-primary"
                }`}
              >
                <Film size={11} />
                Video Tracks
              </button>
            </div>

            {/* Track selector */}
            {tlAudioSource === "audio-tracks" && (
              audioTracks.length === 0 ? (
                <p className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2 py-1.5">
                  No audio tracks — switch to Video Tracks to extract embedded audio.
                </p>
              ) : (
                <Select value={tlAudioTrackId} onValueChange={setTlAudioTrackId} disabled={isTimelineBusy}>
                  <SelectTrigger className="w-full bg-background-secondary border-border text-text-primary text-[10px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background-secondary border-border">
                    <SelectItem value="all">All audio tracks</SelectItem>
                    {audioTracks.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name || "Audio Track"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )
            )}

            {tlAudioSource === "video-tracks" && (
              videoTracks.length === 0 ? (
                <p className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-lg px-2 py-1.5">
                  No video tracks found in the timeline.
                </p>
              ) : (
                <Select value={tlVideoTrackId} onValueChange={setTlVideoTrackId} disabled={isTimelineBusy}>
                  <SelectTrigger className="w-full bg-background-secondary border-border text-text-primary text-[10px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background-secondary border-border">
                    <SelectItem value="all">All video tracks</SelectItem>
                    {videoTracks.map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name || "Video Track"}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )
            )}
          </div>

          {/* Time range */}
          <div className="p-3 bg-background-tertiary rounded-lg space-y-3">
            <span className="text-[10px] font-medium text-text-secondary block">Time Range</span>
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <label className="text-[9px] text-text-muted block mb-1">Start (s)</label>
                <input
                  type="number" min={0} max={Math.max(0, tlRangeEnd - 1)} step={1}
                  value={tlRangeStart}
                  onChange={(e) => setTlRangeStart(Math.max(0, Number(e.target.value)))}
                  disabled={isTimelineBusy}
                  className="w-full px-2 py-1 bg-background-secondary border border-border rounded text-[10px] text-text-primary disabled:opacity-50"
                />
                {tlRangeStart > 0 && <span className="text-[9px] text-text-muted">{fmtTime(tlRangeStart)}</span>}
              </div>
              <ChevronRight size={14} className="text-text-muted mt-3 shrink-0" />
              <div className="flex-1">
                <label className="text-[9px] text-text-muted block mb-1">
                  End (s){timelineDuration > 0 && ` / ${Math.floor(timelineDuration)}`}
                </label>
                <input
                  type="number" min={tlRangeStart + 1} max={Math.ceil(timelineDuration) || 99999} step={1}
                  value={tlRangeEnd}
                  onChange={(e) => setTlRangeEnd(Number(e.target.value))}
                  disabled={isTimelineBusy}
                  className="w-full px-2 py-1 bg-background-secondary border border-border rounded text-[10px] text-text-primary disabled:opacity-50"
                />
                {tlRangeEnd > 0 && <span className="text-[9px] text-text-muted">{fmtTime(tlRangeEnd)}</span>}
              </div>
            </div>
          </div>

          {/* Language + Translate */}
          <div className="p-3 bg-background-tertiary rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Languages size={14} className="text-text-secondary" />
                <span className="text-[10px] text-text-secondary">Source Language</span>
              </div>
              <Select value={tlLang} onValueChange={setTlLang} disabled={isTimelineBusy}>
                <SelectTrigger className="w-auto min-w-[110px] bg-background-secondary border-border text-text-primary text-[10px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background-secondary border-border">
                  {WHISPER_LANGUAGES.map((l) => (
                    <SelectItem key={l.code} value={l.code}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[10px] text-text-secondary">Translate to English</span>
              <button
                onClick={() => setTlTranslate((v) => !v)}
                disabled={isTimelineBusy}
                className={`relative w-9 h-5 rounded-full transition-colors ${
                  tlTranslate ? "bg-primary" : "bg-background-secondary border border-border"
                } disabled:opacity-50`}
              >
                <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${tlTranslate ? "translate-x-4" : "translate-x-0.5"}`} />
              </button>
            </div>

            {tlTranslate && (
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-text-secondary">Target Language</span>
                <Select value={tlTargetLang} onValueChange={setTlTargetLang} disabled={isTimelineBusy}>
                  <SelectTrigger className="w-auto min-w-[110px] bg-background-secondary border-border text-text-primary text-[10px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-background-secondary border-border">
                    {WHISPER_LANGUAGES.filter((l) => l.code !== "auto").map((l) => (
                      <SelectItem key={l.code} value={l.code}>{l.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {/* Model info */}
          <div className="flex items-center justify-between px-1">
            <span className="text-[9px] text-text-muted">Model</span>
            <span className="text-[9px] text-text-muted font-mono">{whisperxModel}</span>
          </div>

          {/* Success */}
          {tlStatus === "done" && tlResult && (
            <div className="flex items-start gap-2 p-2 bg-green-500/10 border border-green-500/30 rounded-lg">
              <CheckCircle size={14} className="text-green-400 shrink-0 mt-0.5" />
              <p className="text-[10px] text-green-400 font-medium">{tlResult}</p>
            </div>
          )}

          <button
            onClick={handleTimelineTranscribe}
            disabled={isTimelineBusy || !project || tlRangeEnd <= tlRangeStart}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg hover:bg-primary/80 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isTimelineBusy ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span className="text-[11px] font-medium">Transcribing…</span>
              </>
            ) : (
              <>
                <Captions size={16} />
                <span className="text-[11px] font-medium">Transcribe Clips</span>
              </>
            )}
          </button>

          <p className="text-[9px] text-text-muted text-center">
            Each clip transcribed individually · whisper-ctranslate2 · {whisperxModel}
          </p>
        </>
      )}
    </div>
  );
};

export default AutoCaptionPanel;
