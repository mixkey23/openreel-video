# Captions: cómo lo hace upstream vs tu fork (insumo para la decisión de OS-306)

Fuente: lectura directa de `upstream/main` (`c934046`) y `origin/main` (`5feeb61`). Lo que no pude comprobar va marcado.

## Upstream (#96 + inspector #71)
- **Alcance: un solo clip.** `AutoCaptionPanel` toma el clip seleccionado (`clipId` o el primer elemento seleccionado) y solo funciona si ese clip es de **vídeo o audio**. Vive en la pestaña IA del inspector («Local Auto-Captions»).
- **Dónde corre:** en el navegador. Un `Worker` ejecuta Whisper con `@huggingface/transformers` (WebGPU si hay, si no WASM). Modelos: *Accurate* (large-v3-turbo, ~760 MB) o *Fast* (tiny, ~100 MB). **Los pesos se descargan de `https://media.openreel.video/models/`** (host externo, una vez; luego caché del navegador). El audio no sale del equipo.
- **Audio de un vídeo:** decodifica el archivo del clip con `loadAudioBuffer(…, {audioTrackIndex: clip.audioTrackIndex})`, es decir, elige **la pista de audio embebida** del clip, y **recorta a `inPoint`/`outPoint` y velocidad** del clip. No lee pistas de audio de la línea de tiempo.
- **Tiempos:** de **segmento** (`return_timestamps: true`, trozos de 30 s), no por palabra. `splitCaptionIntoSingleLineCues` parte cada segmento en líneas de N palabras y **reparte el tiempo proporcionalmente al nº de palabras**, no con tiempos reales.
- **Salida:** cada cue es un **clip de texto editable en una pista «Captions»** (rol `captions`), con metadatos `captionSourceClipId`, modelo, etc., y esa pista se **agrupa con la pista del clip origen**: al mover el clip, `linked-caption-edit` mueve/borra sus captions enlazados. También mantiene el modelo de `timeline.subtitles` con animación (`word-highlight` y otras) para subtítulos importados.
- **Edición:** `CaptionEditorPanel` (selección múltiple, «Select all captions» en la cabecera de pista, dividir cues, máx. palabras por línea). Importa SRT/VTT.
- **Fuera de alcance:** transcribir **una pista entera**, un **rango** de la línea de tiempo, **varios clips a la vez**, usar **pistas de audio** de la línea de tiempo como fuente, traducción, tiempo de permanencia tras el habla. (Multicam tiene su propia transcripción, aparte.)

## Tu fork
- **Tres vías de entrada**
  1. *Inspector, clip de audio seleccionado:* transcribe el propio clip.
  2. *Inspector, clip de vídeo seleccionado:* fuente **«Video File»** (extrae el audio del vídeo) o fuente **«Audio track»** (todas o una pista de audio concreta, solo los clips que solapan ≥ 50 ms con el clip de vídeo).
  3. *Panel AutoCaption, modo «Timeline»:* un **rango** (inicio/fin) de toda la línea de tiempo con fuente **Audio tracks** (todas o una) o **Video tracks** (todas o una, extrayendo su audio); los clips se procesan **uno a uno en cola**, ordenados por tiempo, con cancelación.
- **Dónde corre:** en un **servidor WhisperX/whisper-ctranslate2** propio (`/api/transcribe` o `OPENREEL_TRANSCRIBE_URL`, que `4f699e9` enruta al endpoint local de Framesmith). Sin descargas de modelos en el navegador.
- **Tiempos:** **por palabra** (`words[]`), agrupados por `groupWordsToSubtitles(…, hold)` con **tiempo de lectura configurable** (`hold`, 0,5 s por defecto), traducción opcional a otro idioma, idioma auto/forzado, estilo de animación (`word-highlight` por defecto).
- **Salida:** `addSubtitle` en `timeline.subtitles` (superposición animada), más lista/selección de subtítulos (`SubtitleListPanel`) y gestión de la pista «Captions».
- **Recorte del clip (verificado leyendo el código, no ejecutando):** solo la vía «Video File» del inspector respeta `inPoint`/`outPoint` (usa `transcribeClip` de `packages/core/src/text/transcription-service.ts`). Las demás —clip de audio, pistas de audio y modo «Timeline»— envían **el archivo de medio completo** y colocan los resultados sumando `clip.startTime`, sin mirar `inPoint`, `outPoint` ni velocidad. El commit `2e96b38` («audio clip boundary») **no** lo resuelve: solo exige ≥ 50 ms de solape entre clips y corrige el `endTime` cuando Whisper no devuelve palabras.
  - Consecuencia: con un clip recortado, se transcribe también el audio que no está en la línea de tiempo y los captions salen desplazados. Con clips sin recortar (p. ej. el audio por beat que Framesmith coloca entero) no se nota.

## Comparación
| Capacidad | Upstream | Tu fork |
|---|---|---|
| Un clip (vídeo o audio) | ✅ (pista de audio embebida elegible; respeta recorte y velocidad) | ✅ |
| **Por pista** (todas o una) | ❌ | ✅ audio y vídeo |
| **Rango** de la línea de tiempo / varios clips en cola | ❌ | ✅ |
| Pistas de **audio** de la timeline como fuente | ❌ | ✅ |
| Pistas de **vídeo** (extrae su audio) | solo el clip seleccionado | ✅ |
| Motor | Whisper en el navegador (descarga de modelo desde host externo) | Servidor WhisperX local |
| Precisión de tiempos | segmento + reparto proporcional | **palabra** + hold |
| Traducción | ❌ | ✅ |
| Editar captions después | ✅ clips de texto, enlazados al clip origen | lista de subtítulos + overlay |
| Funciona sin servidor propio | ✅ | ❌ (necesita WhisperX) |
| Alineación con el pipeline de Framesmith (WhisperX S2) | ❌ | ✅ |

## Implicación para la decisión
Lo que valoras (por clip, por pista, pistas de audio, vídeo→audio) **es justo lo que upstream no tiene**. Adoptar solo la UI de upstream (opción a) lo perdería; no es una opción neutra.
La parte de tu fork que realmente aporta es pequeña y portable: **la lógica de selección de fuentes** (clip / pista / rango, audio / vídeo) y **el cliente del servidor WhisperX**. Lo que choca con upstream es la **UI** y el **modelo de datos de salida**.

**Opción c (recomendada): híbrida.**
1. Adoptar de upstream el panel de edición, la pista «Captions» enlazada y el worker del navegador como **motor alternativo** (opcional, con el host del modelo desactivado por defecto por privacidad).
2. Reponer sobre ese panel un selector de **alcance** (clip · pista de audio · pista de vídeo · rango) y de **motor** (WhisperX local · Whisper en navegador), reutilizando el código de selección del fork.
3. Mantener la salida en `timeline.subtitles` con `hold`/`word-highlight` (upstream aún lo soporta) y ofrecer «convertir a clips de texto» con su flujo.
Esfuerzo estimado: ≈ 45–70 h (más que la opción a, menos que portar todo la opción b). Estimación mía, baja confianza.
