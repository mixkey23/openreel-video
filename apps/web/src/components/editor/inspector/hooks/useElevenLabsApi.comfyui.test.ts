/**
 * Characterization of the fork's ComfyUI TTS flow (ported as-is from the fork).
 * Pins the wire contract a future Framesmith endpoint must keep:
 *   POST {host}/prompt  { prompt: { workflowId, inputs: { text } }, client_id }
 *   poll GET {host}/history/{prompt_id}  → status success/done + outputs[*].audio[0]
 *   GET {host}/view?filename&subfolder&type → audio blob
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useSettingsStore } from "../../../../stores/settings-store";
import { useElevenLabsApi } from "./useElevenLabsApi";

const HOST = "http://comfy.test:8188";

function mount() {
  return renderHook(() =>
    useElevenLabsApi({
      hasElevenLabsKey: false,
      settingsOpen: false,
      elevenLabsModel: "eleven_v3",
      defaultLlmProvider: null,
      llmBaseUrl: "",
      llmModel: "",
    }),
  ).result.current;
}

describe("generateWithComfyUI (ported as-is)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    useSettingsStore.setState({ comfyuiHost: `${HOST}/` });
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("queues the workflow with the text, polls history, downloads the audio output", async () => {
    const audio = new Blob(["wav"], { type: "audio/wav" });
    let polls = 0;
    fetchMock.mockImplementation(async (url: string) => {
      if (url === `${HOST}/prompt`) return new Response(JSON.stringify({ prompt_id: "p1" }), { status: 200 });
      if (url === `${HOST}/history/p1`) {
        polls += 1;
        const body = polls < 2
          ? { p1: { status: { status_str: "running" }, outputs: {} } }
          : { p1: { status: { status_str: "success" }, outputs: { "9": { audio: [{ filename: "a.wav", subfolder: "tts", type: "output" }] } } } };
        return new Response(JSON.stringify(body), { status: 200 });
      }
      if (url === `${HOST}/view?filename=a.wav&subfolder=tts&type=output`) return new Response(audio, { status: 200 });
      throw new Error(`unexpected ${url}`);
    });

    const api = mount();
    const pending = api.generateWithComfyUI("hola mundo", "wf-tts");
    await vi.advanceTimersByTimeAsync(5000);
    const blob = await pending;

    const queue = fetchMock.mock.calls.find((c) => c[0] === `${HOST}/prompt`)!;
    const body = JSON.parse(queue[1].body);
    expect(queue[1].method).toBe("POST");
    expect(body.prompt).toEqual({ workflowId: "wf-tts", inputs: { text: "hola mundo" } });
    expect(String(body.client_id)).toMatch(/^openreel-tts-/);
    expect(polls).toBe(2);
    expect(blob.size).toBeGreaterThan(0);
  });

  it("surfaces queue errors, failed runs and missing audio", async () => {
    const api = mount();
    fetchMock.mockResolvedValueOnce(new Response("no", { status: 400 }));
    await expect(api.generateWithComfyUI("x", "wf")).rejects.toThrow("ComfyUI queue error (400)");

    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/prompt")
        ? new Response(JSON.stringify({ prompt_id: "p2" }), { status: 200 })
        : new Response(JSON.stringify({ p2: { status: { status_str: "error" }, outputs: {} } }), { status: 200 }));
    const failed = api.generateWithComfyUI("x", "wf");
    const assertion = expect(failed).rejects.toThrow("ComfyUI audio generation failed");
    await vi.advanceTimersByTimeAsync(2000);
    await assertion;

    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) =>
      url.endsWith("/prompt")
        ? new Response(JSON.stringify({ prompt_id: "p3" }), { status: 200 })
        : new Response(JSON.stringify({ p3: { status: { status_str: "success" }, outputs: { "1": {} } } }), { status: 200 }));
    const none = api.generateWithComfyUI("x", "wf");
    const assertion2 = expect(none).rejects.toThrow("no audio output found");
    await vi.advanceTimersByTimeAsync(2000);
    await assertion2;
  });
});
