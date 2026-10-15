import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CAPTION_ANIMATION_STYLES,
  SUBTITLE_STYLE_PRESETS,
  getAnimationStyleDisplayName,
  type CaptionAnimationStyle,
  type Subtitle,
} from "@openreel/core";
import {
  ToolcraftButton as Button,
  ToolcraftCard as Card,
  ToolcraftNumberInputControl,
  ToolcraftSelectControl as Selector,
  ToolcraftText as Text,
} from "@openreel/ui";
import {
  AlertCircle,
  Check,
  Download,
  Languages,
  Loader2,
  Sparkles,
} from "@/icons/lucide-compat";
import { useProjectStore } from "../../../stores/project-store";
import { useSettingsStore } from "../../../stores/settings-store";
import { useUIStore } from "../../../stores/ui-store";
import { framesmithEpisodeId } from "../../../hooks/use-framesmith-init";
import { loadAudioBuffer } from "../../../utils/load-audio-buffer";
import { audioBufferToWhisperSamples } from "../../../utils/whisper-audio";
import { scaleOverlayStyle } from "../../../utils/caption-style";
import {
  collectCaptionJobs,
  findClip,
  listTracksWithMedia,
  type CaptionJob,
  type CaptionScope,
} from "../../../utils/caption-sources";
import { transcribeJobs, type EngineOutput } from "../../../services/caption-pipeline";
import { transcribeWithServer } from "../../../services/caption-server";
import {
  DEFAULT_WHISPER_MODEL,
  WHISPER_MODELS,
  isWhisperModelKey,
  type WhisperModelKey,
} from "../../../workers/whisper-models";

const CAPTION_STYLE_PRESETS = ["default", "modern", "bold", "cinematic", "minimal"] as const;
const WHISPER_LANGUAGES = [
  { code: "auto", name: "Auto-detect" },
  { code: "en", name: "English" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "es", name: "Spanish" },
  { code: "it", name: "Italian" },
  { code: "pt", name: "Portuguese" },
  { code: "hi", name: "Hindi" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "zh", name: "Chinese" },
  { code: "ru", name: "Russian" },
  { code: "tr", name: "Turkish" },
  { code: "pl", name: "Polish" },
  { code: "vi", name: "Vietnamese" },
] as const;

type Engine = "server" | "browser";
type ScopeKind = "clip" | "range";
type OutputMode = "overlay" | "text-clips";

interface AutoCaptionPanelProps {
  clipId?: string;
  maxWordsPerLine?: number;
}

interface WorkerChunk {
  text: string;
  timestamp: [number | null, number | null];
}

type WorkerState = "idle" | "loading" | "ready";

export const AutoCaptionPanel: React.FC<AutoCaptionPanelProps> = ({
  clipId,
  maxWordsPerLine = 5,
}) => {
  const project = useProjectStore((state) => state.project);
  const getMediaItem = useProjectStore((state) => state.getMediaItem);
  const whisperxModel = useSettingsStore((state) => state.whisperxModel);
  const selectedItems = useUIStore((state) => state.selectedItems);

  const resolvedClipId =
    clipId ?? selectedItems.find((item) => item.type === "clip")?.id ?? "";
  const clipEntry = resolvedClipId ? findClip(project, resolvedClipId) : undefined;
  const clipMedia = clipEntry ? getMediaItem(clipEntry.clip.mediaId) : undefined;
  const clipIsTranscribable = Boolean(
    clipMedia && (clipMedia.type === "video" || clipMedia.type === "audio"),
  );
  const clipIsVideo = clipMedia?.type === "video";

  // Inside Framesmith the local WhisperX server is the natural default; standalone, use the browser.
  const [engine, setEngine] = useState<Engine>(framesmithEpisodeId ? "server" : "browser");
  const [scopeKind, setScopeKind] = useState<ScopeKind>(clipIsTranscribable ? "clip" : "range");
  const [clipSource, setClipSource] = useState<"own" | "audio-tracks">("own");
  const [rangeSource, setRangeSource] = useState<"audio-tracks" | "video-tracks">("audio-tracks");
  const [trackId, setTrackId] = useState("all");
  const [rangeStart, setRangeStart] = useState(0);
  const [rangeEnd, setRangeEnd] = useState(0);
  const [language, setLanguage] = useState("auto");
  const [translateTo, setTranslateTo] = useState("none");
  const [holdSeconds, setHoldSeconds] = useState(0.5);
  const [animation, setAnimation] = useState<CaptionAnimationStyle>("word-highlight");
  const [selectedStyle, setSelectedStyle] = useState<string>("default");
  const [outputMode, setOutputMode] = useState<OutputMode>("overlay");

  const workerRef = useRef<Worker | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [workerState, setWorkerState] = useState<WorkerState>("idle");
  const [selectedModel, setSelectedModel] = useState<WhisperModelKey>(DEFAULT_WHISPER_MODEL);
  const [readyModels, setReadyModels] = useState<Set<WhisperModelKey>>(() => new Set());
  const [modelBackends, setModelBackends] = useState<
    Partial<Record<WhisperModelKey, "webgpu" | "wasm">>
  >({});
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState("");
  const [resultMessage, setResultMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The in-browser engine is only started when chosen (it downloads its model from a remote host).
  useEffect(() => {
    if (engine !== "browser") return undefined;
    const worker = new Worker(
      new URL("../../../workers/whisper-worker.ts", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;
    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [engine]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const audioTracks = useMemo(() => listTracksWithMedia(project, "audio"), [project]);
  const videoTracks = useMemo(() => listTracksWithMedia(project, "video"), [project]);
  const trackOptions = useMemo(() => {
    const wantsVideo = scopeKind === "range" && rangeSource === "video-tracks";
    const tracks = wantsVideo ? videoTracks : audioTracks;
    return [
      { label: wantsVideo ? "All video tracks" : "All audio tracks", value: "all" },
      ...tracks.map((track) => ({ label: track.name, value: track.id })),
    ];
  }, [audioTracks, rangeSource, scopeKind, videoTracks]);

  useEffect(() => {
    if (!trackOptions.some((option) => option.value === trackId)) setTrackId("all");
  }, [trackId, trackOptions]);

  const scope: CaptionScope | null = useMemo(() => {
    if (scopeKind === "clip") {
      if (!clipEntry || !clipIsTranscribable) return null;
      return {
        kind: "clip",
        clipId: clipEntry.clip.id,
        source: clipIsVideo ? clipSource : "own",
        trackId,
      };
    }
    return { kind: "range", start: rangeStart, end: rangeEnd, source: rangeSource, trackId };
  }, [clipEntry, clipIsTranscribable, clipIsVideo, clipSource, rangeEnd, rangeSource, rangeStart, scopeKind, trackId]);

  const runWorker = useCallback(
    (
      type: "load" | "transcribe",
      audio?: Float32Array,
    ): Promise<{ text?: string; chunks?: WorkerChunk[] }> => {
      const worker = workerRef.current;
      if (!worker) return Promise.reject(new Error("Caption worker is not ready."));
      const requestId = crypto.randomUUID();
      const workerLanguage = language === "auto" ? undefined : language;
      return new Promise((resolve, reject) => {
        const handleMessage = (event: MessageEvent<Record<string, unknown>>) => {
          if (event.data.requestId !== requestId) return;
          const messageType = event.data.type;
          if (messageType === "model-progress") {
            setWorkerState("loading");
            const rawProgress = Number(event.data.progress ?? 0);
            setProgress(rawProgress > 1 ? rawProgress / 100 : rawProgress);
            const file = String(event.data.file ?? "caption model").split("/").pop();
            setProgressMessage(`Downloading ${file || "caption model"}…`);
          } else if (messageType === "transcription-progress") {
            setWorkerState("ready");
          } else if (messageType === "ready" || messageType === "result") {
            worker.removeEventListener("message", handleMessage);
            setWorkerState("ready");
            setReadyModels((current) => new Set(current).add(selectedModel));
            const backend = event.data.backend;
            if (backend === "webgpu" || backend === "wasm") {
              setModelBackends((current) => ({ ...current, [selectedModel]: backend }));
            }
            if (messageType === "ready") {
              setProgress(1);
              setProgressMessage("Offline caption model is ready");
              resolve({});
            } else {
              resolve({
                text: String(event.data.text ?? ""),
                chunks: (event.data.chunks ?? []) as WorkerChunk[],
              });
            }
          } else if (messageType === "error") {
            worker.removeEventListener("message", handleMessage);
            reject(new Error(String(event.data.message ?? "Local transcription failed.")));
          }
        };
        worker.addEventListener("message", handleMessage);
        worker.postMessage(
          { requestId, type, audio, language: workerLanguage, model: selectedModel },
          audio ? [audio.buffer] : [],
        );
      });
    },
    [language, selectedModel],
  );

  const handleModelChange = useCallback(
    (value: string) => {
      if (!isWhisperModelKey(value)) return;
      setSelectedModel(value);
      setError(null);
      setProgress(readyModels.has(value) ? 1 : 0);
      setProgressMessage(readyModels.has(value) ? "Offline caption model is ready" : "");
      setWorkerState(readyModels.has(value) ? "ready" : "idle");
    },
    [readyModels],
  );

  const handlePrepareModel = useCallback(async () => {
    setError(null);
    setWorkerState("loading");
    setProgress(0);
    setProgressMessage("Preparing offline caption model…");
    try {
      await runWorker("load");
    } catch (reason) {
      setWorkerState("idle");
      setError(reason instanceof Error ? reason.message : "Model download failed.");
    }
  }, [runWorker]);

  const handleGenerate = useCallback(async () => {
    if (!scope) return;
    const state = useProjectStore.getState();
    const jobs = collectCaptionJobs(state.project, scope);
    setError(null);
    setResultMessage(null);
    if (jobs.length === 0) {
      setError(
        scope.kind === "range"
          ? `No ${scope.source === "video-tracks" ? "video" : "audio"} clips found in that range.`
          : scope.source === "audio-tracks"
            ? "No audio clips found under the selected clip. Switch the audio source to the clip itself."
            : "The selected clip has no usable audio.",
      );
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsTranscribing(true);
    setProgress(0);
    setProgressMessage("Preparing audio…");

    let audioContext: AudioContext | null = null;
    const decoded = new Map<string, AudioBuffer>();

    const loadSamples = async (job: CaptionJob): Promise<Float32Array> => {
      const key = `${job.mediaId}:${job.audioTrackIndex ?? 0}`;
      let buffer = decoded.get(key);
      if (!buffer) {
        const media = state.getMediaItem(job.mediaId);
        const blob = media?.blob ?? (media?.fileHandle ? await media.fileHandle.getFile() : null);
        if (!blob) throw new Error(`Reconnect the source media (${job.mediaName}) before creating captions.`);
        audioContext ??= new AudioContext();
        const loaded = await loadAudioBuffer(audioContext, blob, {
          audioTrackIndex: job.audioTrackIndex,
          onProgress: (next) => setProgressMessage(next.message),
        });
        if (!loaded) throw new Error(`The audio of ${job.mediaName} could not be decoded.`);
        buffer = loaded;
        decoded.set(key, loaded);
      }
      return audioBufferToWhisperSamples(buffer, job.sourceStart, Math.min(buffer.duration, job.sourceEnd));
    };

    const transcribe = async (samples: Float32Array): Promise<EngineOutput> => {
      if (engine === "server") {
        return transcribeWithServer(samples, {
          model: whisperxModel,
          language,
          targetLanguage: translateTo === "none" ? null : translateTo,
          signal: controller.signal,
        });
      }
      const result = await runWorker("transcribe", samples);
      const segments = (result.chunks ?? [])
        .map((chunk) => {
          const start = Math.max(0, chunk.timestamp?.[0] ?? 0);
          const end = chunk.timestamp?.[1] ?? start + 3;
          return { text: chunk.text.trim(), start, end: Math.max(start + 0.1, end) };
        })
        .filter((segment) => segment.text.length > 0);
      return { text: result.text, segments };
    };

    try {
      const { blocks, skipped } = await transcribeJobs(
        jobs,
        {
          loadSamples,
          transcribe,
          signal: controller.signal,
          onProgress: ({ index, total, job }) => {
            setProgress(index / total);
            setProgressMessage(
              `Transcribing ${index + 1} of ${total} (${job.mediaName}) ${engine === "server" ? "on the local server" : "in the browser"}…`,
            );
          },
        },
        { holdSeconds, maxWordsPerBlock: maxWordsPerLine },
      );

      if (blocks.length === 0) {
        throw new Error(skipped[0]?.reason ?? "No speech was detected.");
      }

      const presetStyle = SUBTITLE_STYLE_PRESETS[selectedStyle] ?? SUBTITLE_STYLE_PRESETS.default;
      if (outputMode === "overlay") {
        const style = scaleOverlayStyle(presetStyle, state.project.settings.height);
        const added: Subtitle[] = blocks.map((block) => ({
          id: `whisper-${crypto.randomUUID()}`,
          text: block.text,
          startTime: block.startTime,
          endTime: block.endTime,
          words: block.words,
          animationStyle: animation,
          style,
        }));
        await state.executeAction({
          type: "subtitle/setAll",
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          params: { subtitles: [...state.project.timeline.subtitles, ...added] },
        });
      } else {
        for (const block of blocks) {
          await state.addSubtitle(
            {
              id: `whisper-${crypto.randomUUID()}`,
              text: block.text,
              startTime: block.startTime,
              endTime: block.endTime,
              style: presetStyle,
            },
            {
              captionSource: engine === "server" ? "whisperx" : "whisper",
              captionSourceClipId: block.sourceClipId,
              captionMaxWordsPerLine: maxWordsPerLine,
              captionWhisperModel: engine === "server" ? whisperxModel : selectedModel,
            },
          );
        }
      }
      setProgress(1);
      setResultMessage(
        `${blocks.length} caption${blocks.length === 1 ? "" : "s"} added${
          skipped.length ? ` · ${skipped.length} clip${skipped.length === 1 ? "" : "s"} skipped (${skipped[0].reason.toLowerCase()})` : ""
        }`,
      );
    } catch (reason) {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setError(reason instanceof Error ? reason.message : "Transcription failed.");
    } finally {
      await (audioContext as AudioContext | null)?.close().catch(() => undefined);
      setIsTranscribing(false);
    }
  }, [animation, engine, holdSeconds, language, maxWordsPerLine, outputMode, runWorker, scope, selectedModel, selectedStyle, translateTo, whisperxModel]);

  const modelStatus = useMemo(() => {
    const model = WHISPER_MODELS[selectedModel];
    if (workerState === "ready") {
      const backend = modelBackends[selectedModel];
      return `Downloaded and cached${backend ? ` · ${backend === "webgpu" ? "GPU" : "CPU"}` : ""}`;
    }
    if (workerState === "loading") return progressMessage || "Downloading model…";
    return `${model.downloadSize} · ${model.description}`;
  }, [modelBackends, progressMessage, selectedModel, workerState]);

  const sectionLabel = (text: string) => (
    <Text type="supporting" color="secondary" className="text-[10px]">{text}</Text>
  );

  return (
    <div className="w-full min-w-0 space-y-3">
      <Card variant="muted" padding={3} className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          {sectionLabel("Engine")}
          <Selector
            label="Caption engine"
            isLabelHidden
            size="sm"
            width={190}
            value={engine}
            onChange={(value) => setEngine(value as Engine)}
            isDisabled={isTranscribing}
            options={[
              { label: "Local server (WhisperX)", value: "server" },
              { label: "In this browser (offline)", value: "browser" },
            ]}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          {sectionLabel("Captions for")}
          <Selector
            label="Caption scope"
            isLabelHidden
            size="sm"
            width={190}
            value={scopeKind}
            onChange={(value) => setScopeKind(value as ScopeKind)}
            isDisabled={isTranscribing}
            options={[
              { label: "Selected clip", value: "clip", disabled: !clipIsTranscribable },
              { label: "Timeline range", value: "range" },
            ]}
          />
        </div>

        {scopeKind === "clip" && clipIsVideo && (
          <div className="flex items-center justify-between gap-2">
            {sectionLabel("Audio from")}
            <Selector
              label="Audio source"
              isLabelHidden
              size="sm"
              width={190}
              value={clipSource}
              onChange={(value) => setClipSource(value as "own" | "audio-tracks")}
              isDisabled={isTranscribing}
              options={[
                { label: "The video's own audio", value: "own" },
                { label: "Audio tracks under the clip", value: "audio-tracks" },
              ]}
            />
          </div>
        )}

        {scopeKind === "range" && (
          <>
            <div className="flex items-center justify-between gap-2">
              {sectionLabel("Take audio from")}
              <Selector
                label="Range audio source"
                isLabelHidden
                size="sm"
                width={190}
                value={rangeSource}
                onChange={(value) => setRangeSource(value as "audio-tracks" | "video-tracks")}
                isDisabled={isTranscribing}
                options={[
                  { label: "Audio clips", value: "audio-tracks" },
                  { label: "Video clips (extract audio)", value: "video-tracks" },
                ]}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <ToolcraftNumberInputControl
                label="From (s)"
                size="sm"
                width="100%"
                min={0}
                value={rangeStart}
                onChange={(value) => setRangeStart(Math.max(0, Number(value) || 0))}
              />
              <ToolcraftNumberInputControl
                label="To (s, 0 = end)"
                size="sm"
                width="100%"
                min={0}
                value={rangeEnd}
                onChange={(value) => setRangeEnd(Math.max(0, Number(value) || 0))}
              />
            </div>
          </>
        )}

        {((scopeKind === "clip" && clipIsVideo && clipSource === "audio-tracks") || scopeKind === "range") && (
          <div className="flex items-center justify-between gap-2">
            {sectionLabel("Track")}
            <Selector
              label="Track"
              isLabelHidden
              size="sm"
              width={190}
              value={trackId}
              onChange={setTrackId}
              isDisabled={isTranscribing}
              options={trackOptions}
            />
          </div>
        )}
      </Card>

      {engine === "browser" && (
        <Card variant="muted" padding={3} className="space-y-2 border border-primary/30 bg-primary/5">
          <div className="flex items-center justify-between gap-2">
            {sectionLabel("Model quality")}
            <Selector
              label="Local caption model"
              isLabelHidden
              size="sm"
              width={176}
              value={selectedModel}
              onChange={handleModelChange}
              isDisabled={workerState === "loading" || isTranscribing}
              options={(
                Object.entries(WHISPER_MODELS) as Array<
                  [WhisperModelKey, (typeof WHISPER_MODELS)[WhisperModelKey]]
                >
              ).map(([value, model]) => ({ label: model.label, value }))}
            />
          </div>
          <div className="flex items-start gap-2">
            {workerState === "ready" ? (
              <Check size={15} className="mt-0.5 text-primary" aria-hidden />
            ) : (
              <Download size={15} className="mt-0.5 text-primary" aria-hidden />
            )}
            <div className="min-w-0 flex-1">
              <Text type="supporting" weight="bold" className="block text-[11px] text-fg">
                {WHISPER_MODELS[selectedModel].shortLabel}
              </Text>
              <Text type="supporting" color="secondary" className="block text-[9px]">
                {modelStatus}
              </Text>
            </div>
          </div>
          {workerState === "loading" && (
            <div className="h-1.5 overflow-hidden rounded-full bg-bg-2">
              <div
                className="h-full bg-primary transition-[width]"
                style={{ width: `${Math.max(3, Math.min(100, progress * 100))}%` }}
              />
            </div>
          )}
          {workerState === "idle" && (
            <Button
              label={`Download ${WHISPER_MODELS[selectedModel].shortLabel}`}
              icon={<Download size={13} aria-hidden />}
              variant="secondary"
              size="sm"
              onClick={handlePrepareModel}
              className="w-full justify-center"
            />
          )}
          <Text type="supporting" color="secondary" className="block text-[9px] leading-relaxed">
            The model is downloaded once from media.openreel.video and cached in this browser. Media never leaves your device.
          </Text>
        </Card>
      )}

      {engine === "server" && (
        <Text type="supporting" color="secondary" className="block text-[9px] leading-relaxed">
          Audio is sent to your local WhisperX server ({whisperxModel}) with word-level timing.
        </Text>
      )}

      <Card variant="muted" padding={3} className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5">
            <Languages size={14} className="text-fg-2" aria-hidden />
            {sectionLabel("Language")}
          </div>
          <Selector
            label="Caption language"
            isLabelHidden
            size="sm"
            width={132}
            value={language}
            onChange={setLanguage}
            isDisabled={isTranscribing}
            options={WHISPER_LANGUAGES.map((item) => ({ label: item.name, value: item.code }))}
          />
        </div>
        {engine === "server" && (
          <div className="flex items-center justify-between gap-2">
            {sectionLabel("Translate to")}
            <Selector
              label="Translate captions to"
              isLabelHidden
              size="sm"
              width={132}
              value={translateTo}
              onChange={setTranslateTo}
              isDisabled={isTranscribing}
              options={[
                { label: "No translation", value: "none" },
                ...WHISPER_LANGUAGES.filter((item) => item.code !== "auto").map((item) => ({
                  label: item.name,
                  value: item.code,
                })),
              ]}
            />
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          {sectionLabel("Reading time after speech (s)")}
          <ToolcraftNumberInputControl
            label="Reading hold"
            isLabelHidden
            size="sm"
            width={80}
            min={0}
            max={3}
            step={0.1}
            value={holdSeconds}
            onChange={(value) => setHoldSeconds(Math.max(0, Math.min(3, Number(value) || 0)))}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          {sectionLabel("Animation")}
          <Selector
            label="Caption animation"
            isLabelHidden
            size="sm"
            width={132}
            value={animation}
            onChange={(value) => setAnimation(value as CaptionAnimationStyle)}
            isDisabled={isTranscribing || outputMode === "text-clips"}
            options={CAPTION_ANIMATION_STYLES.map((style) => ({
              label: getAnimationStyleDisplayName(style),
              value: style,
            }))}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          {sectionLabel("Caption style")}
          <Selector
            label="Caption style"
            isLabelHidden
            size="sm"
            width={132}
            value={selectedStyle}
            onChange={setSelectedStyle}
            isDisabled={isTranscribing}
            options={CAPTION_STYLE_PRESETS.map((preset) => ({
              label: preset[0].toUpperCase() + preset.slice(1),
              value: preset,
            }))}
          />
        </div>
        <div className="flex items-center justify-between gap-2">
          {sectionLabel("Add as")}
          <Selector
            label="Caption output"
            isLabelHidden
            size="sm"
            width={190}
            value={outputMode}
            onChange={(value) => setOutputMode(value as OutputMode)}
            isDisabled={isTranscribing}
            options={[
              { label: "Animated subtitles", value: "overlay" },
              { label: "Editable text clips", value: "text-clips" },
            ]}
          />
        </div>
      </Card>

      {error && (
        <Card variant="muted" padding={2} className="flex items-start gap-2 border border-red-500/30 bg-red-500/10">
          <AlertCircle size={14} className="mt-0.5 shrink-0 text-red-400" aria-hidden />
          <Text type="supporting" className="text-[10px] text-red-400">{error}</Text>
        </Card>
      )}

      {isTranscribing && (
        <Card variant="muted" padding={3} className="flex items-center gap-2">
          <Loader2 size={14} className="animate-spin text-primary" aria-hidden />
          <Text type="supporting" color="secondary" className="text-[10px]">
            {progressMessage}
          </Text>
        </Card>
      )}

      {resultMessage && !isTranscribing && (
        <Card variant="muted" padding={2} className="border border-green-500/30 bg-green-500/10">
          <Text type="supporting" className="text-[10px] text-green-400">{resultMessage}</Text>
        </Card>
      )}

      {isTranscribing ? (
        <Button
          label="Cancel"
          variant="secondary"
          size="md"
          onClick={() => abortRef.current?.abort()}
          className="w-full justify-center"
        />
      ) : (
        <Button
          label="Generate Captions"
          icon={<Sparkles size={14} aria-hidden />}
          variant="primary"
          size="md"
          onClick={handleGenerate}
          isDisabled={!scope}
          className="w-full justify-center"
        />
      )}
      {!scope && (
        <Text type="supporting" color="secondary" className="block text-center text-[9px]">
          Select a connected video or audio clip, or switch to a timeline range.
        </Text>
      )}
    </div>
  );
};

export default AutoCaptionPanel;
