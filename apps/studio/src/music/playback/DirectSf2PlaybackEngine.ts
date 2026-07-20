import * as JSSynth from "js-synthesizer";
import type { PlaybackEngine, PlaybackNoteEvent, PlaybackOptions } from "./PlaybackEngine";
import { scheduleActivePitchCallbacks } from "./PlaybackEngine";
import { exactArrayBuffer, playbackEventsToSmf } from "./directSf2Smf";

export type DirectSf2PlaybackConfig = {
  soundFontUrl: string;
  bank?: number;
  program?: number;
  channel?: number;
};

type FluidSynthWindow = Window & typeof globalThis & {
  Module?: unknown;
};

let fluidSynthRuntimePromise: Promise<void> | undefined;
const fluidSynthRuntimeUrl = "/vendor/libfluidsynth-2.4.6.js";
const jsSynthWorkletUrl = "/vendor/js-synthesizer.worklet.js";
const audioWorkletRuntimePromises = new WeakMap<AudioWorklet, Promise<void>>();

type SynthBackend = "audio-worklet" | "script-processor";

export class DirectSf2PlaybackEngine implements PlaybackEngine {
  name = "Direct SF2";
  private audioContext?: AudioContext;
  private audioNode?: AudioNode;
  private masterGain?: GainNode;
  private synth?: JSSynth.ISynthesizer;
  private sfontId?: number;
  private loaded = false;
  private backend?: SynthBackend;
  private stopActivePitchCallbacks?: () => void;

  constructor(private config: DirectSf2PlaybackConfig) {}

  async load(): Promise<void> {
    if (this.loaded) {
      return;
    }

    if (!this.config.soundFontUrl.trim()) {
      throw new Error("Direct SF2 playback needs a SoundFont URL or uploaded .sf2 file.");
    }

    const context = this.getAudioContext();
    const { synth, audioNode, backend } = await createSynthesizerNode(context);
    const masterGain = context.createGain();
    audioNode.connect(masterGain).connect(context.destination);

    const response = await fetch(this.config.soundFontUrl);
    if (!response.ok) {
      throw new Error(`Direct SF2 could not load ${this.config.soundFontUrl} (${response.status}). Put a licensed .sf2 at /soundfonts/default.sf2 or choose a local file.`);
    }

    const soundFontBuffer = await response.arrayBuffer();
    if (!isSoundFontBuffer(soundFontBuffer)) {
      throw new Error(`Direct SF2 did not receive a valid .sf2 SoundFont from ${this.config.soundFontUrl}. Put a licensed .sf2 at /soundfonts/default.sf2 or choose a local file.`);
    }
    const sfontId = await synth.loadSFont(soundFontBuffer);

    this.synth = synth;
    this.audioNode = audioNode;
    this.masterGain = masterGain;
    this.sfontId = sfontId;
    this.backend = backend;
    this.selectProgram();
    this.loaded = true;
  }

  async play(events: PlaybackNoteEvent[], options: PlaybackOptions): Promise<void> {
    await this.load();
    const context = this.getAudioContext();
    await context.resume();
    this.stop();

    if (!this.synth || !this.masterGain) {
      return;
    }

    this.selectProgram();
    this.masterGain.gain.value = Math.min(1, Math.max(0, options.volume));

    const channel = this.config.channel ?? 0;
    const program = this.config.program ?? 0;
    const smf = playbackEventsToSmf(events, {
      ...options,
      channel,
      bank: this.config.bank,
      program
    });

    await this.synth.resetPlayer();
    await this.synth.addSMFDataToPlayer(exactArrayBuffer(smf));
    this.synth.setPlayerTempo(JSSynth.Constants.PlayerSetTempoType.ExternalBpm, Math.max(1, options.bpm * options.speed));
    this.stopActivePitchCallbacks = scheduleActivePitchCallbacks(events, options);
    await this.synth.playPlayer();
  }

  pause(): void {
    this.stop();
  }

  stop(): void {
    this.stopActivePitchCallbacks?.();
    this.stopActivePitchCallbacks = undefined;
    if (this.synth) {
      this.synth.stopPlayer();
      for (let channel = 0; channel < 16; channel += 1) {
        this.synth.midiAllNotesOff(channel);
        this.synth.midiAllSoundsOff(channel);
      }
    }
  }

  dispose(): void {
    this.stop();
    if (this.sfontId !== undefined) {
      this.synth?.unloadSFont(this.sfontId);
    }
    this.audioNode?.disconnect();
    this.masterGain?.disconnect();
    this.synth?.close();
    this.sfontId = undefined;
    this.synth = undefined;
    this.audioNode = undefined;
    this.masterGain = undefined;
    this.backend = undefined;
    this.loaded = false;
  }

  private selectProgram(): void {
    if (!this.synth || this.sfontId === undefined) {
      return;
    }
    const channel = this.config.channel ?? 0;
    const bank = this.config.bank ?? 0;
    const program = this.config.program ?? 0;
    this.synth.midiProgramSelect(channel, this.sfontId, bank, program);
  }

  private getAudioContext(): AudioContext {
    if (!this.audioContext) {
      const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioContextCtor();
    }
    return this.audioContext;
  }
}

async function createSynthesizerNode(context: AudioContext): Promise<{ synth: JSSynth.ISynthesizer; audioNode: AudioNode; backend: SynthBackend }> {
  if (context.audioWorklet && typeof JSSynth.AudioWorkletNodeSynthesizer === "function") {
    try {
      await loadAudioWorkletRuntime(context);
      const synth = new JSSynth.AudioWorkletNodeSynthesizer();
      synth.init(context.sampleRate);
      const audioNode = synth.createAudioNode(context, {
        polyphony: 256,
        initialGain: 0.6
      });
      synth.setGain(0.6);
      return { synth, audioNode, backend: "audio-worklet" };
    } catch (error) {
      console.warn("Direct SF2 AudioWorklet failed; falling back to ScriptProcessor playback.", error);
    }
  }

  await loadFluidSynthRuntime();
  const synth = new JSSynth.Synthesizer();
  synth.init(context.sampleRate, {
    polyphony: 256,
    initialGain: 0.6
  });
  synth.setGain(0.6);
  return {
    synth,
    audioNode: synth.createAudioNode(context, 8192),
    backend: "script-processor"
  };
}

async function loadAudioWorkletRuntime(context: AudioContext): Promise<void> {
  const audioWorklet = context.audioWorklet;
  const existingPromise = audioWorkletRuntimePromises.get(audioWorklet);
  if (existingPromise) {
    return existingPromise;
  }

  const promise = audioWorklet
    .addModule(fluidSynthRuntimeUrl)
    .then(() => audioWorklet.addModule(jsSynthWorkletUrl))
    .catch((error) => {
      audioWorkletRuntimePromises.delete(audioWorklet);
      throw error;
    });

  audioWorkletRuntimePromises.set(audioWorklet, promise);
  return promise;
}

async function loadFluidSynthRuntime(): Promise<void> {
  if (fluidSynthRuntimePromise) {
    return fluidSynthRuntimePromise;
  }

  fluidSynthRuntimePromise = new Promise((resolve, reject) => {
    const fluidWindow = window as FluidSynthWindow;

    if (fluidWindow.Module) {
      resolveFluidSynthModule(fluidWindow.Module).then(resolve, reject);
      return;
    }

    const script = document.createElement("script");
    script.src = fluidSynthRuntimeUrl;
    script.async = true;
    script.onload = () => {
      const module = (window as FluidSynthWindow).Module;
      if (!module) {
        reject(new Error("FluidSynth runtime loaded, but the global Module object was not created."));
        return;
      }
      resolveFluidSynthModule(module).then(resolve, reject);
    };
    script.onerror = () => reject(new Error(`Could not load FluidSynth runtime from ${fluidSynthRuntimeUrl}.`));
    document.head.appendChild(script);
  });

  return fluidSynthRuntimePromise;
}

async function resolveFluidSynthModule(module: unknown): Promise<void> {
  JSSynth.Synthesizer.initializeWithFluidSynthModule(module);
  await JSSynth.waitForReady();
  try {
    JSSynth.disableLogging();
  } catch {
    // Older fluidsynth-emscripten builds can omit optional logging hooks.
  }
}

function isSoundFontBuffer(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < 12) {
    return false;
  }

  const bytes = new Uint8Array(buffer, 0, 12);
  return (
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 12) === "sfbk"
  );
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}
