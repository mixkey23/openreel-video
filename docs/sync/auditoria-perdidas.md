# Auditoría de pérdidas del fork en `sync/upstream-merge`

**Estado:** ✅ hecha sobre la rama real (corrige el ensayo tosco de OS-305).

Método: para cada uno de los 49 commits propios, las **líneas que añadió** (sin builds ni lockfiles) que **siguen en el fork final** (`origin/main`) y **no están en la rama**.

| Resultado | Commits |
|---|--:|
| Sin ninguna línea ausente (incluye 1 de los sustituidos) | 24 |
| Sustituidos a propósito, con líneas ausentes (captions → panel híbrido; `97b50a8`, `27eaa70`, `70d70d8`) | 16 |
| Aplicados con líneas ausentes, **todas explicadas por una adaptación decidida** | 9 |
| Ausencias **no explicadas** | **0** |

Las ausencias de los 9 aplicados (`d2a8a35`, `567dbc5`, `591c602`, `5753f8f`, `1e76c82`, `ce9e959`, `a9386c9`, `7ea5adb`, `3632771`) son: `addClip(…, duration?)` movido de `project-store.ts` a `clip-slice.ts`; `import … from "lucide-react"` → `@/icons/lucide-compat`; la pestaña Info pasa a sección de inspector; `LlmProvider` sin `"ollama"` y sin Piper (decisiones del propietario); la migración de persistencia v2 → paso `version < 8`; el modo micrófono; y los presets de `SubtitleListPanel` (ahora `caption-style`).

**Merges del fork:** de 15, solo 2 tienen resolución manual (`0a9f7a9`, `54c5d8d`; PRs de upstream integrados en el fork); no añadieron líneas propias respecto a sus dos padres.

**Límites:** compara líneas, no comportamiento; un cambio de semántica con las mismas líneas no se vería. La prueba humana (OS-406) cubre eso.
