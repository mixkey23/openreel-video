import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { transcribeWithServer } from "./caption-server";

describe("transcribeWithServer (Framesmith POST /api/transcribe contract)", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let fetchMock: ReturnType<typeof vi.fn<any[], any>>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uploads wav + model/language/target_language and returns words", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ text: "hi", word_count: 1, words: [{ word: "hi", start: 0.1, end: 0.4 }, { word: " ", start: 0.5, end: 0.6 }] }), { status: 200 }));
    const out = await transcribeWithServer(new Float32Array(1600), { model: "large-v3", language: "auto", targetLanguage: null, baseUrl: "http://fs.test/api/" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://fs.test/api/transcribe");
    expect(init.method).toBe("POST");
    const form = init.body as FormData;
    expect((form.get("audio") as File).name).toBe("audio.wav");
    expect(form.get("model")).toBe("large-v3");
    expect(form.get("language")).toBe(""); // auto-detect
    expect(form.get("target_language")).toBe("");
    expect(out.words).toEqual([{ word: "hi", start: 0.1, end: 0.4 }]); // blank words dropped
  });

  it("sends a forced language and a translation target", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ text: "", words: [] }), { status: 200 }));
    await transcribeWithServer(new Float32Array(10), { model: "small", language: "es", targetLanguage: "en", baseUrl: "http://x/api" });
    const form = fetchMock.mock.calls[0][1].body as FormData;
    expect(form.get("language")).toBe("es");
    expect(form.get("target_language")).toBe("en");
  });

  it("surfaces the server's detail on errors", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: "whisper-ctranslate2 not found" }), { status: 503 }));
    await expect(transcribeWithServer(new Float32Array(10), { model: "m", language: "auto", targetLanguage: null, baseUrl: "http://x/api" }))
      .rejects.toThrow("Transcription failed: whisper-ctranslate2 not found");
  });
});
