/** Web Speech API: Urdu/Karachi-style male vs Punjabi female — loud, fast, best-effort voice pick. */

export type RoastVoiceKind = 'urdu-male' | 'punjabi-female';

let voicesReadyPromise: Promise<SpeechSynthesisVoice[]> | null = null;

function getVoicesWhenReady(): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    return Promise.resolve([]);
  }
  if (voicesReadyPromise) return voicesReadyPromise;
  voicesReadyPromise = new Promise((resolve) => {
    const synth = window.speechSynthesis;
    const deliver = () => resolve(synth.getVoices());
    const v = synth.getVoices();
    if (v.length > 0) {
      deliver();
      return;
    }
    const onVoices = () => {
      synth.removeEventListener('voiceschanged', onVoices);
      deliver();
    };
    synth.addEventListener('voiceschanged', onVoices);
    window.setTimeout(() => {
      synth.removeEventListener('voiceschanged', onVoices);
      deliver();
    }, 900);
  });
  return voicesReadyPromise;
}

function langStarts(v: SpeechSynthesisVoice, prefix: string): boolean {
  return v.lang.toLowerCase().startsWith(prefix.toLowerCase());
}

function nameLooksFemale(name: string): boolean {
  const n = name.toLowerCase();
  return (
    /female|woman|girl|feminine|lekha|swara|veena|karen|samantha|victoria|zira|moira|flo|shelley/i.test(
      n,
    ) || /\(.*f\)|\bf\b/.test(n)
  );
}

function nameLooksMale(name: string): boolean {
  const n = name.toLowerCase();
  return /male|man|david|daniel|arjun|rahul|aaron|fred|jorge|diego|thomas|mark|alex/.test(n);
}

function pickVoice(voices: SpeechSynthesisVoice[], kind: RoastVoiceKind): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;

  if (kind === 'urdu-male') {
    const tryOrder: (() => SpeechSynthesisVoice | undefined)[] = [
      () => voices.find((v) => langStarts(v, 'ur') && (nameLooksMale(v.name) || !nameLooksFemale(v.name))),
      () => voices.find((v) => langStarts(v, 'ur')),
      () => voices.find((v) => langStarts(v, 'hi') && (nameLooksMale(v.name) || !nameLooksFemale(v.name))),
      () => voices.find((v) => langStarts(v, 'hi')),
      () => voices.find((v) => langStarts(v, 'en-in') || langStarts(v, 'en-gb')),
      () => voices.find((v) => langStarts(v, 'en') && !nameLooksFemale(v.name)),
    ];
    for (const fn of tryOrder) {
      const v = fn();
      if (v) return v;
    }
    return voices[0] ?? null;
  }

  const tryPunjabiFemale: (() => SpeechSynthesisVoice | undefined)[] = [
    () => voices.find((v) => (langStarts(v, 'pa') || langStarts(v, 'pa-in')) && nameLooksFemale(v.name)),
    () => voices.find((v) => langStarts(v, 'pa')),
    () => voices.find((v) => langStarts(v, 'hi') && nameLooksFemale(v.name)),
    () => voices.find((v) => langStarts(v, 'hi')),
    () => voices.find((v) => langStarts(v, 'en') && nameLooksFemale(v.name)),
  ];
  for (const fn of tryPunjabiFemale) {
    const v = fn();
    if (v) return v;
  }
  return voices.find((v) => nameLooksFemale(v.name)) ?? voices[0] ?? null;
}

/** Stop any in-progress roast (new wrong answer). */
export function cancelInformalSpeech(): void {
  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
}

/**
 * Speak roast loudly and clearly. Uses browser TTS (voices vary by OS).
 * Karachi “feel”: Urdu/HI/EN-IN male-ish + slightly lower pitch.
 * Punjabi mix: pa/hi female-ish + higher pitch.
 */
export function speakInformalRoast(text: string, kind: RoastVoiceKind): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;

  cancelInformalSpeech();

  void getVoicesWhenReady().then((voices) => {
    const voice = pickVoice(voices, kind);
    const u = new SpeechSynthesisUtterance(text);
    u.volume = 1;
    u.rate = 1.22;
    if (voice) u.voice = voice;

    if (kind === 'urdu-male') {
      u.pitch = voice && langStarts(voice, 'ur') ? 0.95 : 0.88;
      if (!voice || langStarts(voice, 'en')) u.lang = 'en-IN';
      else if (voice.lang) u.lang = voice.lang;
    } else {
      u.pitch = 1.14;
      if (voice?.lang) u.lang = voice.lang;
      else u.lang = 'pa-IN';
    }

    try {
      window.speechSynthesis.speak(u);
    } catch {
      // ignore
    }
  });
}

/** Prime voice list after first user gesture (improves first roast on Safari). */
export function warmupSpeechSynthesis(): void {
  if (typeof window === 'undefined' || !window.speechSynthesis) return;
  void getVoicesWhenReady();
}
