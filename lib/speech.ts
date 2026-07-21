import * as Speech from 'expo-speech';
import { LanguageConfig } from './languages';

// Cache the best voice per language prefix (e.g. 'en', 'zh')
const voiceCache: Record<string, string | null> = {};
let voicesLoaded = false;
let allVoices: Speech.Voice[] = [];

// Preferred voice name patterns by language, ordered by priority.
// Higher-quality / more natural voices come first.
const VOICE_PREFERENCES: Record<string, string[]> = {
  en: [
    'Google US English',
    'Google UK English Female',
    'Google UK English Male',
    'Samantha',
    'Alex',
    'Daniel',
    'Karen',
    'Moira',
    'Tessa',
    'Microsoft Aria',
    'Microsoft Jenny',
    'Microsoft Guy',
  ],
  zh: [
    'Google 普通话（中国大陆）',
    'Ting-Ting',
    'Sin-ji',
    'Mei-jia',
    'Microsoft Xiaoxiao',
    'Microsoft Yunxi',
  ],
  ja: ['Google 日本語', 'Kyoko', 'Otoya', 'Microsoft Nanami'],
  ko: ['Google 한국의', 'Yuna', 'Microsoft Sunhi'],
  es: ['Google español', 'Mónica', 'Jorge', 'Microsoft Alvaro'],
  fr: ['Google français', 'Thomas', 'Amélie', 'Microsoft Denise'],
  de: ['Google Deutsch', 'Anna', 'Markus', 'Microsoft Katja'],
};

function langPrefix(ttsCode: string): string {
  return ttsCode.split('-')[0].toLowerCase();
}

async function ensureVoices(): Promise<void> {
  if (voicesLoaded) return;
  try {
    allVoices = await Speech.getAvailableVoicesAsync();
    voicesLoaded = true;
  } catch {
    allVoices = [];
    voicesLoaded = true;
  }
}

function pickBestVoice(ttsCode: string): string | null {
  const prefix = langPrefix(ttsCode);
  if (voiceCache[prefix] !== undefined) return voiceCache[prefix];

  // Filter voices matching the language
  const langVoices = allVoices.filter(
    (v) => v.language.toLowerCase().startsWith(prefix),
  );
  if (langVoices.length === 0) {
    voiceCache[prefix] = null;
    return null;
  }

  // Try preferred names in order
  const prefs = VOICE_PREFERENCES[prefix] ?? [];
  for (const pref of prefs) {
    const match = langVoices.find(
      (v) =>
        v.name.toLowerCase().includes(pref.toLowerCase()) ||
        v.identifier.toLowerCase().includes(pref.toLowerCase()),
    );
    if (match) {
      voiceCache[prefix] = match.identifier;
      return match.identifier;
    }
  }

  // Fallback: prefer voices whose quality is 'enhanced' or 'premium',
  // then pick the first one that matches the full locale.
  const enhanced = langVoices.find(
    (v) =>
      (v as any).quality === 'enhanced' || (v as any).quality === 'premium',
  );
  if (enhanced) {
    voiceCache[prefix] = enhanced.identifier;
    return enhanced.identifier;
  }

  // Prefer exact locale match (e.g. en-US for en-US ttsCode)
  const exact = langVoices.find(
    (v) => v.language.toLowerCase() === ttsCode.toLowerCase(),
  );
  const chosen = exact ?? langVoices[0];
  voiceCache[prefix] = chosen.identifier;
  return chosen.identifier;
}

export async function speakWord(
  text: string,
  language: LanguageConfig,
): Promise<void> {
  Speech.stop();
  await ensureVoices();
  const voice = pickBestVoice(language.ttsCode);
  Speech.speak(text, {
    language: language.ttsCode,
    rate: language.ttsRate,
    ...(voice ? { voice } : {}),
    onError: (error) => {
      console.warn(`TTS failed for ${language.ttsCode}:`, error);
    },
  });
}

export function stopSpeaking(): void {
  Speech.stop();
}
