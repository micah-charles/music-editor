import { parsePitchName, pitchToMidi } from "@foxchild/music-core";

type ActiveVoice = {
  oscillator: OscillatorNode;
  gain: GainNode;
};

export class NoteAudition {
  private audioContext?: AudioContext;
  private masterGain?: GainNode;
  private activeVoices = new Map<string, ActiveVoice>();

  noteOn(pitch: string, velocity = 0.75): void {
    if (this.activeVoices.has(pitch) || typeof window === "undefined") {
      return;
    }

    const context = this.getAudioContext();
    void context.resume();

    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    const level = Math.min(0.45, Math.max(0.04, velocity) * 0.42);

    oscillator.type = "triangle";
    oscillator.frequency.value = pitchToFrequency(pitch);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(level, now + 0.015);
    oscillator.connect(gain).connect(this.getMasterGain(context));
    oscillator.start(now);

    this.activeVoices.set(pitch, { oscillator, gain });
  }

  noteOff(pitch: string): void {
    const voice = this.activeVoices.get(pitch);
    if (!voice || !this.audioContext) {
      return;
    }

    this.activeVoices.delete(pitch);
    releaseVoice(voice, this.audioContext.currentTime);
  }

  trigger(pitch: string, durationMs = 260, velocity = 0.75): void {
    this.noteOn(pitch, velocity);
    window.setTimeout(() => this.noteOff(pitch), durationMs);
  }

  stopAll(): void {
    if (!this.audioContext) {
      this.activeVoices.clear();
      return;
    }

    const now = this.audioContext.currentTime;
    this.activeVoices.forEach((voice) => releaseVoice(voice, now));
    this.activeVoices.clear();
  }

  dispose(): void {
    this.stopAll();
    this.masterGain?.disconnect();
    this.masterGain = undefined;
  }

  private getAudioContext(): AudioContext {
    if (!this.audioContext) {
      const AudioContextCtor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.audioContext = new AudioContextCtor();
    }
    return this.audioContext;
  }

  private getMasterGain(context: AudioContext): GainNode {
    if (!this.masterGain) {
      this.masterGain = context.createGain();
      this.masterGain.gain.value = 0.9;
      this.masterGain.connect(context.destination);
    }
    return this.masterGain;
  }
}

export function pitchToFrequency(pitch: string): number {
  return midiToFrequency(pitchToMidi(parsePitchName(pitch)));
}

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function releaseVoice(voice: ActiveVoice, now: number): void {
  try {
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(0.0001, now, 0.035);
    voice.oscillator.stop(now + 0.16);
    voice.oscillator.onended = () => {
      voice.oscillator.disconnect();
      voice.gain.disconnect();
    };
  } catch {
    voice.oscillator.disconnect();
    voice.gain.disconnect();
  }
}
