# CONFLICTS — registro de resoluciones

Rama `sync/upstream-merge` (publicada en el fork), creada desde `upstream/main`; los commits propios se reaplican con `cherry-pick -x` en orden cronológico. Formato: commit · archivos · criterio · ganador.

| Commit | Archivos | Criterio | Ganador |
|---|---|---|---|
| `aea7b9b` | `use-router.ts` | unión de rutas motion + framesmith | ambos |
| `d2a8a35` | `stores/project-store.ts, project/types.ts, project/clip-slice.ts` | upstream separó el store en slices: se conserva project-store.ts de upstream y addClip(…,duration?) se porta a clip-slice.ts + 2 firmas | upstream+reaplicado |
| `567dbc5` | `stores/settings-store.ts` | upstream LlmProvider=openai/anthropic-compatible (+llmBaseUrl/Model, mcp, agent); el fork añadía "ollama" y TranscriptionProvider. Se conservan los tipos de upstream, se añaden TranscriptionProvider y la pestaña local-providers, y todos los campos/acciones de ambos lados. "ollama" NO se añade a LlmProvider (decisión diferida a 1e76c82) | fusión |
| `591c602` | `settings/SettingsDialog.tsx, GeneralPanel.tsx` | upstream rehizo el diálogo con Tabs/Toolcraft: se conserva el de upstream y se añade la pestaña "Local AI" (Cpu) + render de LocalProvidersPanel; el cambio de 1 línea de GeneralPanel (ollama visible en selector LLM) no aplica y se omite; import Plus sin usar eliminado | fusión |
| `5753f8f` | `stores/settings-store.ts` | persist: upstream v7 (migraciones propias) vs fork v2 (hosts a LAN). Se sube a v8, se conservan las migraciones de upstream y la del fork pasa a "version < 8" | fusión |

**Descartado a propósito:** `97b50a8` (inspector en pestañas #71, variante del fork): upstream ya trae su versión (`3ee0205`).

**Estado:** 16 commits reaplicados (incluye 5 resoluciones manuales arriba). **Detenido en `1e76c82`** (integra ComfyUI TTS, WhisperX en captions y Ollama en «enhance text»): 31 conflictos en 7 archivos que exigen una decisión de producto, ver OS-305.

> Nota: los commits propios de `apps/web/dist/` (builds) también se reaplican y añaden ~7 400 líneas de bundles; en el cierre se descartan y se reconstruye `dist` una sola vez (OS-601).
