# CONFLICTS — registro de resoluciones

Rama `sync/upstream-merge` (publicada en el fork), creada desde `upstream/main`; los commits propios se reaplican con `cherry-pick -x` en orden cronológico. Formato: commit · archivos · criterio · ganador.

| Commit | Archivos | Criterio | Ganador |
|---|---|---|---|
| `aea7b9b` | `use-router.ts` | unión de rutas motion + framesmith | ambos |
| `d2a8a35` | `stores/project-store.ts, project/types.ts, project/clip-slice.ts` | upstream separó el store en slices: se conserva project-store.ts de upstream y addClip(…,duration?) se porta a clip-slice.ts + 2 firmas | upstream+reaplicado |
| `567dbc5` | `stores/settings-store.ts` | upstream LlmProvider=openai/anthropic-compatible (+llmBaseUrl/Model, mcp, agent); el fork añadía "ollama" y TranscriptionProvider. Se conservan los tipos de upstream, se añaden TranscriptionProvider y la pestaña local-providers, y todos los campos/acciones de ambos lados. "ollama" NO se añade a LlmProvider (decisión diferida a 1e76c82) | fusión |
| `591c602` | `settings/SettingsDialog.tsx, GeneralPanel.tsx` | upstream rehizo el diálogo con Tabs/Toolcraft: se conserva el de upstream y se añade la pestaña "Local AI" (Cpu) + render de LocalProvidersPanel; el cambio de 1 línea de GeneralPanel (ollama visible en selector LLM) no aplica y se omite; import Plus sin usar eliminado | fusión |
| `5753f8f` | `stores/settings-store.ts` | persist: upstream v7 (migraciones propias) vs fork v2 (hosts a LAN). Se sube a v8, se conservan las migraciones de upstream y la del fork pasa a "version < 8" | fusión |
| `1e76c82` | `inspector/TextToSpeechPanel, hooks/useElevenLabsApi, hooks/useTtsActions, tts-constants, settings-store, GeneralPanel, AutoCaptionPanel` | upstream quitó Piper y el selector de proveedor TTS: se parte de la versión de upstream (Toolcraft) y se reañade ComfyUI TTS tal cual (selector de proveedor + workflow, generateWithComfyUI, entradas de ajustes). AutoCaptionPanel (WhisperX file) y Ollama-enhance quedan diferidos | upstream+reaplicado |
| `1398e0c` | `apps/web/dist/index.html` | bundle generado: se conserva el actual; el dist se reconstruye una sola vez al final (OS-601) | HEAD |
| `813f9ca` | `stores/project-store.test.ts` | el describe de setClipAudioPlan del fork se anexa como bloque propio al final (upstream cambió el final del fichero); project-store.ts aplicó sin conflicto | upstream+reaplicado |
| `f878ad1 (parcial)` | `hooks/use-framesmith-autosave.ts` | se porta solo la parte de persistencia (save-now, subida de medios externos, mensajes al padre); InspectorPanel/AutoCaptionPanel/AiTab de ese commit pasan a la fase híbrida de captions | fork |

**Descartado a propósito:** `97b50a8` (inspector en pestañas #71, variante del fork): upstream ya trae su versión (`3ee0205`).

## Estado (al cierre de esta sesión)

- **25 commits** sobre `upstream/main`; `tsc` sin errores.
- **Núcleo Framesmith completo:** bootstrap, bridge, persistencia en servidor, `originalUrl`, música (`setClipAudioPlan`, merge idempotente, multi-pista) y autosave con `save-now`/subida de medios externos. Contratos OS-201, 202, 203, 205 y música (31 tests): **todos en verde en esta rama.**
- **ComfyUI TTS portado tal cual** (selector de proveedor + workflow, `generateWithComfyUI`), con prueba del contrato de red (`useElevenLabsApi.comfyui.test.ts`).
- **Pendientes (24 commits del fork):** bloque de auto-captions/subtítulos (14), lista de subtítulos + clic en vista previa (6), pestaña Info (1), pestañas solo-icono (2), y `f878ad1` (parte de captions). Esperan la confirmación de la opción híbrida de captions (`captions-comparison.md`).
- **Diferido y pendiente de decisión:** Ollama en «enhance text» (`1e76c82`): necesita `ollama` en `LlmProvider`, que afecta al chat de agentes de upstream.

> Nota: los commits propios de `apps/web/dist/` (builds) también se reaplican; en el cierre se descartan y se reconstruye `dist` una sola vez (OS-601). `apps/web/dist` está en el `.gitignore` de upstream.
