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
| `captions (4f699e9, 0401c75, 3d5b4b1, 6d8bc23, d2dec11, 6f76ba3, 364bb24, 187d395, 8de049f, c316c5a, 2e96b38, 9856e2f, cc26545, 1fea597, f878ad1 parte captions)` | `inspector/AutoCaptionPanel + utils/caption-* + services/caption-*` | sustituidos por el panel híbrido (alcance del fork, motor local/navegador, salida animada o clips de texto, recorte corregido) | nuevo código |
| `a9386c9` | `components/editor/AssetsPanel.tsx` | solo imports de iconos: se conserva el import de upstream (@/icons/lucide-compat) y se añade Captions; Preview.tsx (clic para seleccionar subtítulo) aplicó sin conflicto | fusión |
| `a9386c9..9663a1c + 1fea597 (lista de subtítulos)` | `panels/SubtitleListPanel, utils/caption-style, AutoCaptionPanel` | upstream cambió applySubtitleStylePreset (solo clips de texto de Captions): presets y «Apply to All» pasan a una acción subtitle/setAll sobre timeline.subtitles; presets de subtítulos animados = los del store (tamaños 1080p) escalados al lienzo | adaptación |
| `ce9e959` | `InspectorPanel.tsx, inspector/clip-tabs.config.ts` | upstream pasó el inspector a secciones apiladas: se parte de la versión de upstream y la Info se añade como primera sección «Clip Info»; clip-tabs.config (+ test) incluye info | upstream+reaplicado |
| `27eaa70, 70d70d8` | `shell/InspectorTabs, AssetsPanel` | omitidos: InspectorTabs ya no se usa y el panel Assets de upstream es un raíl vertical con etiqueta (el desborde que arreglaban ya no existe) | omitidos |

**Descartado a propósito:** `97b50a8` (inspector en pestañas #71, variante del fork): upstream ya trae su versión (`3ee0205`).

## Estado — reaplicación completa

- **Los 49 commits propios están resueltos:** 32 aplicados con su commit original (`-x`), 17 sustituidos u omitidos a propósito (bloque de captions → panel híbrido; `97b50a8`, `27eaa70`, `70d70d8` sin objeto en upstream).
- Rama `sync/upstream-merge`: **36 commits** sobre `upstream/main` · `tsc` sin errores · suite completa de `apps/web`: **207 ficheros · 1 155 tests · 0 fallos** (línea base de upstream: 1 042; los 8 fallos previos del fork están resueltos).
- **Funciones del fork presentes:** núcleo Framesmith (bootstrap, bridge, persistencia, `originalUrl`, música, autosave con `save-now`), ComfyUI TTS tal cual, pestaña «Local AI», captions híbridos, lista de subtítulos con estilo global, clic en la vista previa y sección «Clip Info».
- **Decidido: no se porta** Ollama en «enhance text» (se usa «OpenAI-compatible» con `http://<host>:11434/v1`; pendiente de comprobar CORS) ni el modo micrófono (upstream lo eliminó).
- **Adaptaciones que cambian comportamiento respecto al fork** (revisar en la prueba humana): sección Clip Info plegada por defecto y en forma de sección (no pestaña); máximo de palabras por bloque lo fija el control de upstream (5) en lugar de 10; Preset/Apply to All del panel Subtitles actúan con una sola acción; sin Piper.

## Verificación de G2 (hecha en esta sesión)
- `dist` reconstruido una vez (OS-601) y probado en Chromium bajo `/openreel/` · auditoría de pérdidas sin ausencias sin explicar · ducking idéntico (OS-503) · workspace reducido (OS-506) · red auditada (OS-507) · integración con Framesmith verificada (OS-208).
- Rama: **`sync/upstream-merge`**, suite de `apps/web` 208 ficheros / 1 162 tests, `tsc` 0 errores.
- **Pendiente:** OS-406, la prueba humana de S6 con `episode_035` (carga, restore, mover escena, autosave, 3 modos de música, ducking de oído, captions).
- **Decisiones abiertas:** desactivar `api.openreel.video` (compartir / plantillas en la nube); aligerar el `dist` de 59 MB quitando el motor de Whisper del navegador y multicam; comprobar CORS de Ollama.
