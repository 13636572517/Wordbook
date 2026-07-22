import * as Speech from 'expo-speech';
import { Platform } from 'react-native';
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
  // Web（含手机 PWA）：直接用 Web Speech API，
  // 且 speak 必须在用户手势内同步调用（iOS Safari 限制），
  // 不能 await 任何异步操作。
  if (Platform.OS === 'web') {
    speakWordWeb(text, language);
    return;
  }
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

// --- Web Speech API 实现（同步，无 await）---
let webVoices: SpeechSynthesisVoice[] = [];

function refreshWebVoices(): void {
  try {
    webVoices = window.speechSynthesis.getVoices();
  } catch {
    webVoices = [];
  }
}

if (
  Platform.OS === 'web' &&
  typeof window !== 'undefined' &&
  'speechSynthesis' in window
) {
  refreshWebVoices();
  // 语音列表异步加载完成后刷新
  window.speechSynthesis.onvoiceschanged = refreshWebVoices;
}

function pickWebVoice(ttsCode: string): SpeechSynthesisVoice | null {
  if (webVoices.length === 0) refreshWebVoices();
  const prefix = langPrefix(ttsCode);
  const langVoices = webVoices.filter((v) =>
    v.lang.toLowerCase().replace('_', '-').startsWith(prefix),
  );
  if (langVoices.length === 0) return null;

  const prefs = VOICE_PREFERENCES[prefix] ?? [];
  for (const pref of prefs) {
    const match = langVoices.find((v) =>
      v.name.toLowerCase().includes(pref.toLowerCase()),
    );
    if (match) return match;
  }

  // 优先精确匹配地区（如 en-US）
  const exact = langVoices.find(
    (v) => v.lang.toLowerCase().replace('_', '-') === ttsCode.toLowerCase(),
  );
  return exact ?? langVoices[0];
}

function speakWordWeb(text: string, language: LanguageConfig): void {
  if (typeof window === 'undefined') return;
  // 英文单词优先用有道词典真人发音 MP3：
  // - 华为 HarmonyOS 等设备无 Google TTS 引擎，speechSynthesis 无可用语音会静默失败
  // - 真人发音比 TTS 更准确自然，且音频播放在所有手机浏览器/PWA 都可靠
  if (langPrefix(language.ttsCode) === 'en') {
    // type: 0=英音 1=美音
    const type = language.ttsCode.toLowerCase().includes('gb') ? 0 : 1;
    const url = `https://dict.youdao.com/dictvoice?audio=${encodeURIComponent(text)}&type=${type}`;
    try {
      if (dictAudio) {
        dictAudio.pause();
        dictAudio = null;
      }
      const audio = new Audio(url);
      dictAudio = audio;
      const fallback = () => speakWithSynthesis(text, language);
      audio.onerror = fallback;
      // 必须在用户手势内同步调用 play()
      const p = audio.play();
      if (p && typeof p.catch === 'function') p.catch(fallback);
      return;
    } catch {
      // 降级到 Web Speech API
    }
  }
  speakWithSynthesis(text, language);
}

let dictAudio: HTMLAudioElement | null = null;

function speakWithSynthesis(text: string, language: LanguageConfig): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language.ttsCode;
  utterance.rate = language.ttsRate;
  const voice = pickWebVoice(language.ttsCode);
  if (voice) utterance.voice = voice;
  utterance.onerror = (e) => {
    console.warn(`Web TTS failed for ${language.ttsCode}:`, e);
  };
  synth.speak(utterance);
}

export function stopSpeaking(): void {
  if (Platform.OS === 'web') {
    if (dictAudio) {
      dictAudio.pause();
      dictAudio = null;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    return;
  }
  Speech.stop();
}
