import { stripRubyForTTS } from '../utils/rubyParser';

class JapaneseSpeechService {
  private synth: SpeechSynthesis | null = null;
  private voices: SpeechSynthesisVoice[] = [];
  private currentUtterance: SpeechSynthesisUtterance | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      this.synth = window.speechSynthesis;
      this.loadVoices();
      if (this.synth.onvoiceschanged !== undefined) {
        this.synth.onvoiceschanged = () => this.loadVoices();
      }
    }
  }

  private loadVoices() {
    if (!this.synth) return;
    this.voices = this.synth.getVoices();
  }

  public getJapaneseVoices(): SpeechSynthesisVoice[] {
    if (!this.synth) return [];
    if (this.voices.length === 0) {
      this.voices = this.synth.getVoices();
    }
    return this.voices.filter(v => v.lang.startsWith('ja') || v.lang.includes('JP'));
  }

  public speak(
    text: string,
    rate: number = 1.0,
    voiceURI?: string,
    onStart?: () => void,
    onEnd?: () => void,
    onError?: (err: any) => void
  ) {
    if (!this.synth) {
      console.warn('SpeechSynthesis is not supported in this browser.');
      return;
    }

    this.stop();

    const cleanText = stripRubyForTTS(text);
    if (!cleanText) return;

    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.lang = 'ja-JP';
    utterance.rate = Math.max(0.5, Math.min(1.5, rate));

    const jaVoices = this.getJapaneseVoices();
    if (voiceURI) {
      const selected = jaVoices.find(v => v.voiceURI === voiceURI);
      if (selected) utterance.voice = selected;
    } else if (jaVoices.length > 0) {
      // Pick first Japanese voice or preferred natural voice
      const preferred = jaVoices.find(v => v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Nanami'));
      utterance.voice = preferred || jaVoices[0];
    }

    utterance.onstart = () => {
      onStart?.();
    };

    utterance.onend = () => {
      this.currentUtterance = null;
      onEnd?.();
    };

    utterance.onerror = (e) => {
      this.currentUtterance = null;
      onError?.(e);
    };

    this.currentUtterance = utterance;
    this.synth.speak(utterance);
  }

  public stop() {
    if (this.synth) {
      this.synth.cancel();
      this.currentUtterance = null;
    }
  }

  public isSpeaking(): boolean {
    return this.synth ? this.synth.speaking : false;
  }
}

export const speechService = new JapaneseSpeechService();
