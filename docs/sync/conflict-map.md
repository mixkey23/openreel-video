# OS-102 — Mapa de conflictos (`origin/main` ⟵ `upstream/main`)

Generado con `git merge-tree --write-tree --name-only` sobre `5feeb61` ⟷ `c934046` (base `5ed9f3cf`). **162 archivos**, **1 113 hunks** (marcadores `<<<<<<<`).

Columnas: **hunks** = conflictos textuales; **fork Δ / up Δ** = líneas añadidas+borradas por cada lado desde la base; **directa** = líneas que difieren hoy entre fork y upstream; **add/add** = ambos crearon el archivo independientemente.

## Resumen por categoría

| Categoría | Archivos | Hunks |
|---|---:|---:|
| a · upstream gana (reaplicar retoques del fork) | 36 | 67 |
| b · fork gana | 0 | 0 |
| c · fusión manual | 125 | 1021 |
| d · generado/lock (regenerar) | 1 | 25 |
| e · propio del fork sin contraparte | 0 | 0 |
| **Total** | **162** | **1113** |

Criterios (heurísticos, revisar antes de resolver): **d** = lockfiles/dist. **a** = el fork apenas difiere (cambio del fork ≤ 6 líneas frente a ≥ 3× de upstream, o diferencia directa ≤ 30 líneas). **c** = el resto: ambos lados cambian de forma sustancial. No hay archivos **b** ni **e**: ningún conflicto tiene un lado trivial a favor del fork.

**Lectura clave:** 72 de los 162 son *add/add* (ambos lados crearon el archivo). Es el rastro de que el fork ya incorporó versiones anteriores de funciones de upstream (ver OS-106). La sola magnitud de `project-store.ts` (48 hunks), `Preview.tsx` (115) e `InspectorPanel.tsx` (31) concentra el coste.

## Detalle (ordenado por hunks)

| Archivo | Cat. | Hunks | Fork Δ | Up Δ | Directa | add/add |
|---|:-:|--:|--:|--:|--:|:-:|
| `apps/web/src/components/editor/Preview.tsx` | c | 115 | 2776 | 5466 | 3492 |  |
| `apps/web/src/stores/project-store.ts` | c | 48 | 2628 | 4978 | 4280 |  |
| `apps/web/src/components/editor/InspectorPanel.tsx` | c | 31 | 1527 | 1815 | 1174 |  |
| `apps/web/src/components/editor/panels/EffectsTransitionsPanel.tsx` | c | 29 | 647 | 1795 | 1336 | sí |
| `apps/web/src/components/editor/timeline/ClipComponent.tsx` | c | 29 | 392 | 750 | 472 |  |
| `apps/web/src/components/editor/AssetsPanel.tsx` | c | 27 | 1734 | 1843 | 1029 |  |
| `apps/web/src/components/editor/Timeline.tsx` | c | 25 | 710 | 1619 | 1353 |  |
| `pnpm-lock.yaml` | d | 25 | 371 | 6130 | 5779 |  |
| `packages/core/src/video/video-engine.ts` | c | 23 | 766 | 2221 | 1713 |  |
| `apps/web/src/bridges/audio-text-sync-bridge.ts` | c | 21 | 356 | 448 | 168 | sí |
| `apps/web/src/components/editor/EditorInterface.tsx` | c | 19 | 379 | 655 | 370 |  |
| `apps/web/src/components/editor/inspector/hooks/useElevenLabsApi.ts` | c | 18 | 374 | 278 | 228 | sí |
| `apps/web/src/components/editor/Toolbar.tsx` | c | 16 | 1203 | 1108 | 851 |  |
| `apps/web/src/components/editor/inspector/VoiceBrowser.tsx` | c | 16 | 305 | 295 | 172 | sí |
| `apps/web/src/components/editor/inspector/tabs/EffectsTab.tsx` | c | 15 | 392 | 431 | 147 | sí |
| `apps/web/src/stores/settings-store.ts` | c | 15 | 390 | 292 | 272 | sí |
| `apps/web/src/components/editor/inspector/AudioTextSyncPanel.tsx` | c | 14 | 325 | 405 | 360 | sí |
| `apps/web/src/components/editor/inspector/TextToSpeechPanel.tsx` | c | 14 | 630 | 566 | 384 |  |
| `apps/web/src/components/editor/settings/GeneralPanel.tsx` | c | 14 | 265 | 426 | 405 | sí |
| `apps/web/src/stores/project-store.test.ts` | c | 14 | 1043 | 1874 | 961 |  |
| `packages/core/src/export/export-engine.ts` | c | 14 | 968 | 1238 | 408 |  |
| `apps/web/src/components/editor/panels/RecipesTab.tsx` | c | 13 | 368 | 389 | 87 | sí |
| `apps/web/src/components/editor/timeline/ShapeClipComponent.tsx` | c | 13 | 130 | 256 | 152 |  |
| `apps/web/src/components/editor/ScriptViewDialog.tsx` | c | 11 | 434 | 435 | 299 |  |
| `apps/web/src/components/editor/inspector/AudioDuckingSection.tsx` | c | 11 | 349 | 754 | 469 |  |
| `apps/web/src/components/editor/settings/ApiKeysPanel.tsx` | c | 11 | 404 | 446 | 246 | sí |
| `apps/web/src/components/editor/timeline/TextClipComponent.tsx` | c | 11 | 119 | 253 | 162 |  |
| `packages/core/src/audio/audio-engine.ts` | c | 11 | 540 | 592 | 80 |  |
| `apps/web/src/components/editor/inspector/ClipTransitionSection.tsx` | c | 10 | 163 | 470 | 351 |  |
| `apps/web/src/components/editor/inspector/MotionPathSection.tsx` | c | 10 | 286 | 310 | 136 | sí |
| `apps/web/src/components/editor/panels/AutoEditPanel.tsx` | c | 10 | 309 | 342 | 227 | sí |
| `apps/web/src/components/editor/panels/EditingTemplateControls.tsx` | c | 10 | 182 | 185 | 107 | sí |
| `apps/web/src/components/editor/tour/MoGraphTour.tsx` | c | 10 | 277 | 288 | 69 | sí |
| `apps/web/src/stores/ui-store.ts` | c | 10 | 81 | 122 | 43 |  |
| `apps/web/src/components/editor/KeyframeEditorPanel.tsx` | c | 9 | 522 | 521 | 141 | sí |
| `apps/web/src/components/editor/inspector/ColorGradingSection.tsx` | c | 9 | 138 | 195 | 103 |  |
| `apps/web/src/components/editor/inspector/ParticleEffectsSection.tsx` | c | 9 | 520 | 574 | 686 | sí |
| `apps/web/src/components/editor/inspector/TextSection.tsx` | c | 9 | 314 | 1021 | 1029 |  |
| `apps/web/src/components/editor/inspector/tabs/AiTab.tsx` | c | 9 | 392 | 205 | 375 | sí |
| `apps/web/src/components/editor/inspector/tabs/TransformTab.tsx` | c | 9 | 230 | 406 | 388 | sí |
| `apps/web/src/components/editor/timeline/TrackHeader.tsx` | c | 9 | 161 | 344 | 315 |  |
| `apps/web/src/index.css` | c | 9 | 290 | 309 | 115 |  |
| `apps/web/src/components/editor/inspector/ModelSelector.tsx` | c | 8 | 163 | 193 | 112 | sí |
| `apps/web/src/components/editor/inspector/hooks/useTtsActions.ts` | a | 8 | 309 | 290 | 25 | sí |
| `apps/web/src/components/editor/panels/HighlightExtractorPanel.tsx` | c | 8 | 316 | 249 | 183 | sí |
| `apps/web/src/components/editor/settings/MasterPasswordDialog.tsx` | c | 8 | 265 | 277 | 194 | sí |
| `apps/web/src/components/editor/timeline/TrackLane.tsx` | c | 8 | 98 | 242 | 160 |  |
| `packages/core/src/export/export-engine.test.ts` | c | 8 | 198 | 401 | 209 |  |
| `apps/web/src/components/editor/inspector/MaskSection.tsx` | c | 7 | 235 | 659 | 518 |  |
| `apps/web/src/components/editor/panels/TemplatesTab.tsx` | c | 7 | 181 | 197 | 38 | sí |
| `apps/web/src/components/editor/timeline/GraphicsClipContextMenu.tsx` | c | 7 | 122 | 158 | 106 | sí |
| `apps/web/src/services/secure-storage.ts` | c | 7 | 534 | 577 | 43 | sí |
| `packages/core/src/audio/realtime-audio-graph.ts` | c | 7 | 126 | 160 | 34 |  |
| `apps/web/src/components/editor/inspector/StabilizationSection.tsx` | c | 6 | 223 | 218 | 115 | sí |
| `apps/web/src/components/editor/tour/tour-steps.ts` | c | 6 | 73 | 82 | 49 | sí |
| `apps/web/src/services/api-proxy.ts` | c | 6 | 74 | 175 | 115 | sí |
| `apps/web/src/stores/project/types.ts` | c | 6 | 101 | 236 | 145 |  |
| `packages/core/src/actions/action-executor.ts` | c | 6 | 205 | 899 | 750 |  |
| `packages/core/src/graphics/graphics-engine.ts` | c | 6 | 133 | 212 | 79 |  |
| `apps/web/src/components/editor/InspectorPanel.tabs.test.tsx` | c | 5 | 139 | 150 | 117 | sí |
| `apps/web/src/components/editor/inspector/AutoCaptionPanel.tsx` | c | 5 | 739 | 686 | 1083 |  |
| `apps/web/src/components/editor/inspector/NoiseReductionSection.tsx` | c | 5 | 808 | 1034 | 412 |  |
| `apps/web/src/components/editor/kieai/KieAIImageDialog.tsx` | c | 5 | 320 | 341 | 119 | sí |
| `apps/web/src/components/editor/tour/TourPopover.tsx` | c | 5 | 244 | 255 | 41 | sí |
| `apps/web/src/components/editor/tour/mograph-tour-steps.ts` | a | 5 | 128 | 128 | 10 | sí |
| `packages/core/src/ai/background-removal-engine.ts` | c | 5 | 89 | 138 | 69 |  |
| `packages/core/src/ai/person-segmentation-engine.ts` | c | 5 | 220 | 456 | 518 | sí |
| `packages/core/src/text/audio-text-sync-engine.ts` | c | 5 | 209 | 253 | 48 | sí |
| `packages/core/src/video/transition-engine.test.ts` | c | 5 | 144 | 472 | 330 | sí |
| `packages/core/src/video/video-effects-engine.ts` | c | 5 | 249 | 622 | 389 |  |
| `apps/web/functions/api/proxy/[[catchall]].ts` | c | 4 | 161 | 206 | 59 | sí |
| `apps/web/src/components/editor/inspector/BehindSubjectSection.tsx` | c | 4 | 86 | 101 | 35 | sí |
| `apps/web/src/components/editor/inspector/ShapeSection.tsx` | c | 4 | 33 | 587 | 582 |  |
| `apps/web/src/components/editor/inspector/SpeedRampSection.tsx` | c | 4 | 264 | 594 | 362 |  |
| `apps/web/src/components/editor/kieai/forms/QwenForm.tsx` | c | 4 | 97 | 112 | 143 | sí |
| `apps/web/src/components/editor/timeline/ClipContextMenu.tsx` | c | 4 | 146 | 248 | 258 |  |
| `packages/core/src/audio/clip-audio-resolution.ts` | a | 4 | 117 | 96 | 27 | sí |
| `packages/core/src/editing-templates/types.ts` | a | 4 | 301 | 310 | 13 | sí |
| `apps/web/src/App.tsx` | c | 3 | 22 | 127 | 141 |  |
| `apps/web/src/components/editor/inspector/AlignmentSection.tsx` | c | 3 | 115 | 133 | 162 | sí |
| `apps/web/src/components/editor/inspector/KeyframesSection.tsx` | c | 3 | 217 | 347 | 328 |  |
| `apps/web/src/components/editor/inspector/SVGSection.tsx` | c | 3 | 23 | 175 | 172 |  |
| `apps/web/src/components/editor/inspector/SpeedSection.tsx` | c | 3 | 76 | 300 | 274 |  |
| `apps/web/src/components/editor/inspector/clip-tabs.config.ts` | a | 3 | 63 | 61 | 22 | sí |
| `apps/web/src/components/editor/inspector/tabs/AudioTab.tsx` | c | 3 | 73 | 132 | 59 | sí |
| `apps/web/src/components/editor/kieai/ModelPicker.tsx` | a | 3 | 89 | 87 | 24 | sí |
| `apps/web/src/components/editor/settings/SettingsDialog.tsx` | c | 3 | 75 | 95 | 124 | sí |
| `apps/web/src/components/editor/timeline/TimeRuler.tsx` | c | 3 | 136 | 157 | 47 |  |
| `apps/web/src/components/editor/timeline/utils.ts` | c | 3 | 91 | 191 | 130 |  |
| `apps/web/src/hooks/useAnalytics.ts` | c | 3 | 39 | 51 | 36 | sí |
| `apps/web/src/services/highlight-service.ts` | c | 3 | 81 | 92 | 79 | sí |
| `apps/web/src/stores/timeline-store.test.ts` | c | 3 | 52 | 116 | 70 | sí |
| `packages/core/src/graphics/types.ts` | c | 3 | 26 | 82 | 78 |  |
| `packages/core/src/media/media-import-service.ts` | c | 3 | 92 | 190 | 104 |  |
| `packages/core/src/media/mediabunny-engine.ts` | c | 3 | 37 | 324 | 293 |  |
| `packages/core/src/playback/playback-controller.ts` | c | 3 | 73 | 118 | 51 |  |
| `packages/core/src/video/transition-engine.ts` | c | 3 | 304 | 1223 | 933 |  |
| `packages/core/src/video/video-effects-engine.test.ts` | c | 3 | 142 | 403 | 265 | sí |
| `packages/ui/src/components/color-picker.tsx` | a | 3 | 373 | 377 | 4 | sí |
| `packages/ui/src/components/tabs.tsx` | a | 3 | 111 | 115 | 10 |  |
| `README.md` | c | 2 | 8 | 335 | 341 |  |
| `apps/web/package.json` | a | 2 | 3 | 33 | 30 |  |
| `apps/web/src/bridges/transition-bridge.ts` | c | 2 | 37 | 250 | 221 |  |
| `apps/web/src/components/audio-mixer/AudioMixer.tsx` | c | 2 | 81 | 125 | 54 |  |
| `apps/web/src/components/editor/inspector/AdjustmentLayerSection.tsx` | c | 2 | 66 | 609 | 629 |  |
| `apps/web/src/components/editor/inspector/AudioDuckingSection.test.tsx` | c | 2 | 127 | 169 | 44 | sí |
| `apps/web/src/components/editor/inspector/AudioResult.tsx` | c | 2 | 80 | 88 | 82 | sí |
| `apps/web/src/components/editor/inspector/EnhancedTextPreview.tsx` | c | 2 | 36 | 50 | 38 | sí |
| `apps/web/src/components/editor/inspector/TransitionInspector.tsx` | c | 2 | 9 | 739 | 732 |  |
| `apps/web/src/components/editor/inspector/shell/InspectorClipHeader.tsx` | a | 2 | 23 | 26 | 13 | sí |
| `apps/web/src/components/editor/inspector/shell/InspectorSection.tsx` | c | 2 | 40 | 52 | 50 | sí |
| `apps/web/src/components/editor/inspector/shell/InspectorTabs.tsx` | c | 2 | 51 | 40 | 63 | sí |
| `apps/web/src/components/editor/inspector/tts-constants.ts` | a | 2 | 26 | 15 | 13 | sí |
| `apps/web/src/components/editor/kieai/forms/Flux2Form.tsx` | c | 2 | 58 | 64 | 80 | sí |
| `apps/web/src/components/editor/kieai/forms/GrokForm.tsx` | c | 2 | 36 | 43 | 45 | sí |
| `apps/web/src/components/editor/kieai/forms/NanoBanana2Form.tsx` | c | 2 | 79 | 79 | 114 | sí |
| `apps/web/src/components/editor/kieai/forms/SeedreamForm.tsx` | c | 2 | 58 | 64 | 80 | sí |
| `apps/web/src/components/editor/kieai/forms/ZImageForm.tsx` | c | 2 | 49 | 57 | 68 | sí |
| `apps/web/src/components/editor/preview/canvas-renderers.ts` | c | 2 | 307 | 622 | 367 |  |
| `apps/web/src/components/welcome/RecoveryDialog.tsx` | c | 2 | 41 | 193 | 184 |  |
| `apps/web/src/hooks/use-router.ts` | a | 2 | 4 | 21 | 21 |  |
| `apps/web/src/main.tsx` | c | 2 | 29 | 54 | 59 |  |
| `apps/web/src/utils/load-audio-buffer.ts` | a | 2 | 78 | 77 | 5 | sí |
| `packages/core/src/actions/action-history.ts` | c | 2 | 79 | 120 | 41 |  |
| `packages/core/src/animation/gsap-engine.ts` | a | 2 | 488 | 503 | 15 | sí |
| `.gitignore` | c | 1 | 8 | 50 | 44 |  |
| `apps/web/src/bridges/playback-bridge.ts` | c | 1 | 12 | 103 | 93 |  |
| `apps/web/src/components/Toast.tsx` | a | 1 | 125 | 135 | 10 |  |
| `apps/web/src/components/editor/AIGenTab.tsx` | c | 1 | 20 | 106 | 86 |  |
| `apps/web/src/components/editor/dialogs/AspectRatioMatchDialog.tsx` | a | 1 | 5 | 126 | 123 |  |
| `apps/web/src/components/editor/inspector/AutoCutSilenceSection.tsx` | c | 1 | 20 | 264 | 248 |  |
| `apps/web/src/components/editor/inspector/BackgroundRemovalSection.tsx` | c | 1 | 14 | 229 | 215 |  |
| `apps/web/src/components/editor/inspector/ColorWheelsControl.tsx` | c | 1 | 16 | 78 | 64 |  |
| `apps/web/src/components/editor/inspector/shell/InspectorTabErrorBoundary.test.tsx` | a | 1 | 29 | 30 | 1 | sí |
| `apps/web/src/components/editor/inspector/shell/InspectorTabErrorBoundary.tsx` | a | 1 | 28 | 28 | 2 | sí |
| `apps/web/src/components/editor/inspector/tabs/SpeedTab.tsx` | a | 1 | 68 | 68 | 2 | sí |
| `apps/web/src/components/editor/timeline/KeyframeTrack.tsx` | a | 1 | 150 | 150 | 2 | sí |
| `apps/web/src/components/editor/timeline/Playhead.tsx` | a | 1 | 39 | 40 | 25 |  |
| `apps/web/src/components/welcome/WelcomeScreen.tsx` | c | 1 | 11 | 133 | 122 |  |
| `apps/web/src/config/api-endpoints.ts` | a | 1 | 37 | 21 | 18 | sí |
| `apps/web/src/hooks/useProjectRecovery.ts` | a | 1 | 8 | 6 | 2 |  |
| `apps/web/src/services/share-service.ts` | a | 1 | 12 | 19 | 7 |  |
| `apps/web/src/stores/timeline-store.ts` | c | 1 | 100 | 166 | 66 |  |
| `apps/web/src/stores/ui-store.test.ts` | a | 1 | 18 | 29 | 11 | sí |
| `apps/web/tailwind.config.js` | a | 1 | 105 | 105 | 2 |  |
| `package.json` | a | 1 | 10 | 17 | 11 |  |
| `packages/core/package.json` | a | 1 | 2 | 12 | 10 |  |
| `packages/core/src/actions/inverse-action-generator.ts` | c | 1 | 31 | 350 | 319 |  |
| `packages/core/src/animation/index.ts` | a | 1 | 19 | 22 | 3 |  |
| `packages/core/src/audio/index.ts` | a | 1 | 4 | 6 | 2 |  |
| `packages/core/src/editing-templates/built-in-templates.ts` | c | 1 | 1704 | 1736 | 34 | sí |
| `packages/core/src/editing-templates/categories.ts` | c | 1 | 58 | 106 | 50 | sí |
| `packages/core/src/media/index.ts` | a | 1 | 2 | 15 | 13 |  |
| `packages/core/src/storage/project-serializer.ts` | c | 1 | 12 | 234 | 224 |  |
| `packages/core/src/text/types.ts` | a | 1 | 39 | 63 | 24 |  |
| `packages/core/src/types/actions.ts` | a | 1 | 2 | 284 | 282 |  |
| `packages/core/src/types/project.ts` | a | 1 | 10 | 39 | 29 |  |
| `packages/core/src/types/timeline.ts` | c | 1 | 46 | 205 | 159 |  |
| `packages/core/src/video/mask-engine.ts` | c | 1 | 118 | 195 | 77 |  |
| `packages/ui/src/components/dialog.tsx` | a | 1 | 28 | 30 | 4 |  |
| `tsconfig.base.json` | a | 1 | 2 | 10 | 8 |  |
| `packages/core/src/text/transcription-service.ts` | c | 0 | 67 | 369 | 430 |  |
