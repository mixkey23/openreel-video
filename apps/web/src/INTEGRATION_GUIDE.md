# OpenReel AI Integration Guide

Complete guide to using Ollama, WhisperX, and ComfyUI providers in OpenReel.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    AI Providers Layer                       │
├─────────────────────────────────────────────────────────────┤
│  OllamaProvider  │  OllamaVisionProvider  │  ComfyUIProvider│
│  (Chat/LLM)      │  (Vision/Image Analysis)  │  (Generation)│
└──────────────────────────────────────────────────────────────┘
                            ↑
┌─────────────────────────────────────────────────────────────┐
│              Transcription & Audio Analysis                 │
├─────────────────────────────────────────────────────────────┤
│  WhisperXProvider  │  AutoCutService                        │
│  (Transcription)   │  (Silence & Speaker Detection)         │
└──────────────────────────────────────────────────────────────┘
                            ↑
┌─────────────────────────────────────────────────────────────┐
│           High-Level Composition Services (Fase 4)          │
├─────────────────────────────────────────────────────────────┤
│ • SmartBrollService      → Transcript → Visual Prompts → Images
│ • AutoStoryboardService  → Script → Scenes → Keyframes → Images
│ • AIClipAnalyzerService  → Clip Frames → Analysis → Suggestions
│ • AutoSocialShortsService → Audio → Highlights → Shorts Timeline
└─────────────────────────────────────────────────────────────┘
                            ↑
┌─────────────────────────────────────────────────────────────┐
│            React Components & Custom Hooks                  │
├─────────────────────────────────────────────────────────────┤
│ useAIProviders()          │  useComfyUI()                   │
│ useOllama()               │  useCompositionServices()       │
│ useOllamaVision()         │  useSmartBroll()                │
│ useWhisperX()             │  useAutoStoryboard()            │
│ useAutoCut()              │  useAIClipAnalyzer()            │
│                           │  useAutoSocialShorts()          │
└──────────────────────────────────────────────────────────────┘
```

## Settings Configuration

All providers are configured via Zustand store (`settings-store.ts`):

### Ollama Configuration
```typescript
ollamaHost: "http://localhost:11434"
ollamaModel: "qwen2.5:14b-instruct"
ollamaVisionModel: "qwen3-vl:4b"
```

### WhisperX Configuration
```typescript
whisperxBaseUrl: "http://localhost:8000"
whisperxModel: "large-v3" // or large-v3-turbo, medium, small
whisperxLanguage: "en"
whisperxEnableVad: true
whisperxEnableDiarization: true
whisperxMinSilenceMs: 300
whisperxVadThreshold: 0.5
whisperxPaddingMs: 100
```

### ComfyUI Configuration
```typescript
comfyuiHost: "http://localhost:8188"
comfyuiDefaultImageModel: "flux" // flux, sdxl, qwen-image
comfyuiDefaultVideoModel: "ltx"   // wan, ltx, hunyuan, cosmos, veo
comfyuiAutoDiscovery: true
```

### Auto-Cut Configuration
```typescript
autoCutMinSegmentDuration: 0.5  // seconds
autoCutUseSpeakerChanges: true
autoCutUseSilences: true
```

## Usage Examples

### 1. Generate Smart B-Roll

```typescript
import { useSmartBroll } from "@/hooks/useCompositionServices";
import { useWhisperX } from "@/hooks/useAIProviders";

function BrollGenerator() {
  const { generate: generateBroll, smartBroll } = useSmartBroll();
  const whisperx = useWhisperX();

  async function handleGenerateBroll() {
    // Step 1: Transcribe audio
    const transcript = await whisperx.transcribe(audioFile);

    // Step 2: Generate B-roll
    const result = await generateBroll(
      transcript,
      "Professional interview about AI trends"
    );

    // result.segments contains timing + prompts + generated images
    console.log("Generated", result.successCount, "B-roll images");
  }

  return <button onClick={handleGenerateBroll}>Generate B-Roll</button>;
}
```

### 2. Create Storyboards from Scripts

```typescript
import { useAutoStoryboard } from "@/hooks/useCompositionServices";

function StoryboardGenerator({ script, videoTitle }) {
  const { generate: generateStoryboard } = useAutoStoryboard();

  async function handleGenerateStoryboard() {
    const result = await generateStoryboard(script, videoTitle, 300);

    // result.frames contains keyframe images + descriptions + timing
    console.log("Generated", result.frames.length, "storyboard frames");

    // Export to timeline
    const timeline = result.frames.map((frame) => ({
      time: frame.timestamp,
      image: frame.imageUrl,
      description: frame.description,
    }));
  }

  return <button onClick={handleGenerateStoryboard}>Create Storyboard</button>;
}
```

### 3. Analyze Video Clips

```typescript
import { useAIClipAnalyzer } from "@/hooks/useCompositionServices";

function ClipAnalyzer({ clipUrl }) {
  const { analyze } = useAIClipAnalyzer();

  async function handleAnalyzeClip() {
    const result = await analyze(clipUrl, 5); // 5 keyframes

    // Frame-by-frame analysis
    result.frameAnalyses.forEach((frame) => {
      console.log(`Frame ${frame.frameNumber}:`);
      console.log(`  Quality: ${frame.quality}`);
      console.log(`  Usability: ${frame.usability}`);
      console.log(`  Suggestions:`, frame.suggestions);
    });

    // Get editing recommendations
    const report = clipAnalyzer.getEditingReport(result);
    console.log("Recommended usage:", report.summary);
  }

  return <button onClick={handleAnalyzeClip}>Analyze Clip</button>;
}
```

### 4. Generate Social Media Shorts

```typescript
import { useAutoSocialShorts } from "@/hooks/useCompositionServices";

function ShortsGenerator({ audioFile }) {
  const { generate, optimizeForPlatform } = useAutoSocialShorts();

  async function handleGenerateShorts() {
    // Generate shorts with highlight detection
    const result = await generate(audioFile, 60, "tiktok");

    console.log("Found", result.totalHighlightsFound, "highlight moments");

    // Optimize for TikTok
    const optimized = optimizeForPlatform(result, "tiktok");

    // Get timeline for editor
    const timeline = socialShorts.exportToTimeline(optimized.shorts);
    console.log("Generated", timeline.length, "clips");
  }

  return <button onClick={handleGenerateShorts}>Generate Shorts</button>;
}
```

### 5. Direct Provider Usage

```typescript
import {
  useOllama,
  useOllamaVision,
  useWhisperX,
  useComfyUI,
  useAutoCut,
} from "@/hooks/useAIProviders";

function CustomWorkflow() {
  const ollama = useOllama();
  const vision = useOllamaVision();
  const whisperx = useWhisperX();
  const comfyui = useComfyUI();
  const autoCut = useAutoCut();

  // Use providers directly
  async function runCustomWorkflow() {
    // 1. Transcribe
    const transcript = await whisperx.transcribe(audioFile);

    // 2. Get speaker info
    const speakers = await whisperx.getSpeakers(audioFile);

    // 3. Generate script
    const scriptPrompt = `Write a script for ${speakers.length} speakers based on this transcript...`;
    const scriptResponse = await ollama.chat([
      { role: "user", content: scriptPrompt },
    ]);

    // 4. Analyze images
    const analysis = await vision.describeScene(imageFile);

    // 5. Generate visuals
    const imageResult = await comfyui.generateImage({
      model: "flux",
      prompt: "cinematic shot of...",
    });

    // 6. Auto-cut from silence
    const cuts = await autoCut.generateCuts(audioFile);

    console.log("Custom workflow complete");
  }

  return <button onClick={runCustomWorkflow}>Run Workflow</button>;
}
```

## Workflow Patterns

### Pattern 1: Transcription → Analysis → Generation

```
WhisperX
  ↓ (transcript + speakers)
OllamaProvider
  ↓ (analysis/suggestions)
ComfyUI
  ↓ (generate visuals)
Timeline
```

### Pattern 2: Vision Analysis → Enhancement

```
OllamaVisionProvider
  ↓ (scene analysis)
ComfyUI Upscaler
  ↓ (enhance quality)
Timeline Editor
```

### Pattern 3: Multi-Provider Orchestration

```
WhisperX (transcription)
    ↓
Ollama (content analysis)
    ↓
ComfyUI (image generation)
    ↓
AutoCut Service (timeline building)
    ↓
Output Timeline
```

## Error Handling

All services throw `ProviderError` with structured information:

```typescript
import { ProviderError } from "@/services/ai/providers";

try {
  await ollama.chat(messages);
} catch (err) {
  if (err instanceof ProviderError) {
    console.log(`[${err.provider}] ${err.code}: ${err.message}`);
  }
}
```

## Performance Optimization

### Memoization
Use custom hooks which memoize provider instances:

```typescript
const ollama = useOllama(); // Recreated only when settings change
```

### Polling & Monitoring
ComfyUI provider includes configurable polling:

```typescript
const result = await comfyui.executeWorkflow(
  workflowId,
  inputs,
  (progress) => {
    console.log("Progress:", progress.nodeId, progress.progress);
  }
);
```

### Batch Processing
Process multiple items sequentially or in parallel:

```typescript
// Sequential (preserve order, lower memory)
for (const image of images) {
  await comfyui.upscaleImage({ image });
}

// Parallel (faster, higher memory)
await Promise.all(
  images.map((img) => comfyui.upscaleImage({ image: img }))
);
```

## Debugging

Enable debug logging for troubleshooting:

```typescript
// In settings
localStorage.setItem("DEBUG", "openreel:*");

// Provider-specific debug info
const health = await ollama.healthCheck();
const models = await ollama.listModels();
const stats = await comfyui.getSystemStats();
```

## Limitations & Known Issues

1. **ComfyUI Polling**: Max 1 hour timeout, adjust if needed
2. **Image Extraction**: Depends on workflow output format
3. **Vision Models**: Qwen3-VL recommended, others may vary
4. **WhisperX Diarization**: Requires audio with multiple speakers
5. **Auto-Cut**: Min segment duration prevents very short cuts

## Future Enhancements

- [ ] WebSocket real-time progress for ComfyUI
- [ ] Batch workflow queuing with priority
- [ ] Local caching of generated images
- [ ] Provider fallback chains
- [ ] Advanced prompt optimization
- [ ] Voice cloning integration
- [ ] Multi-language support
