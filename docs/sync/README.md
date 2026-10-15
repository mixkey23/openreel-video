# docs/sync — Sincronización con `Augani/openreel-video`

Notas de la **ruta corta** (backlog §5, Framesmith `docs/analysis/openreel-upstream-merge-backlog.md`). Sesión del 2026-10-15. **Reaplicación de la estrategia E completa; verificación de G2 casi cerrada (falta la prueba humana).** Ningún cambio en `main`, en el pin de Framesmith ni force-push.

| ID | Qué | Estado |
|---|---|---|
| [OS-001](OS-001.md) | Clon completo, `upstream`, cifras de §0 | ✅ coinciden todas |
| [OS-002](OS-002.md) | Tag y rama de retorno | ✅ publicados por el propietario |
| [OS-003](OS-003.md) | Línea base fork | ✅ 8 fallos previos documentados |
| [OS-004](OS-004.md) | Línea base upstream | ✅ 100 % verde |
| [OS-101](OS-101.md), [conflicts-raw.txt](conflicts-raw.txt) | 162 conflictos | ✅ |
| [OS-102](OS-102.md), [conflict-map.md](conflict-map.md) | Clasificación | ✅ heurística |
| [OS-106](OS-106.md) | Duplicados | ✅ hallazgo: 143/159 commits ya están en el fork |
| [OS-201](OS-201.md)–[OS-205](OS-205.md) | Contratos Framesmith (pruebas) | ✅ 25 tests nuevos + 31 de música |
| [OS-304](OS-304.md) | Selectiva | ✅ no viable por commit |
| [OS-305](OS-305.md) | Ensayo estrategia E (extra) | ✅ 40/49 limpios |
| [**OS-306**](OS-306.md) | **Matriz de decisión · G1** | ✅ |
| [CONFLICTS.md](CONFLICTS.md) | Registro de resoluciones de `sync/upstream-merge` | ✅ 49/49 commits propios resueltos |
| [captions-comparison.md](captions-comparison.md) | Captions: upstream vs fork → diseño híbrido | ✅ implementado |
| [OS-208](OS-208.md) | Puntos de integración con Framesmith | ✅ verificados |
| [OS-503](OS-503.md) | Ducking de música sobre el motor integrado | ✅ idéntico; fundidos nuevos |
| [OS-506](OS-506.md) | Workspace reducido y peso | ✅ aplicado (`dist` 59 MB: decisión abierta) |
| [OS-507](OS-507.md) | Red añadida por upstream | ✅ auditada |
| [OS-601](OS-601.md) | `dist` reconstruido + prueba de humo en Chromium | ✅ |
| [auditoria-perdidas](auditoria-perdidas.md) | ¿Se pierde algo del fork? | ✅ 0 ausencias sin explicar |
| [smoke-openreel.cjs](smoke-openreel.cjs) | Script de la prueba de humo | — |

Pruebas añadidas (apps/web/src): `stores/framesmith-store-contract.test.ts`, `hooks/framesmith-{init,bridge,autosave}-contract.test.ts`.
