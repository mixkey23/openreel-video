# docs/sync — Sincronización con `Augani/openreel-video`

Notas de la **ruta corta** (backlog §5, Framesmith `docs/analysis/openreel-upstream-merge-backlog.md`). Sesión del 2026-10-15. **Detenida en la puerta G1.** Ningún cambio en `main`, en el pin de Framesmith ni force-push.

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
| [CONFLICTS.md](CONFLICTS.md) | Registro de resoluciones | vacío (sin resoluciones) |

Pruebas añadidas (apps/web/src): `stores/framesmith-store-contract.test.ts`, `hooks/framesmith-{init,bridge,autosave}-contract.test.ts`.
