import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const flashCard = fs.readFileSync(path.join(root, 'components/FlashCard.tsx'), 'utf8');
const firstLetterTrainer = fs.readFileSync(path.join(root, 'components/FirstLetterTrainer.tsx'), 'utf8');
const sessionProvider = fs.readFileSync(path.join(root, 'components/SessionProvider.tsx'), 'utf8');
const speech = fs.readFileSync(path.join(root, 'lib/speech.ts'), 'utf8');
const layout = fs.readFileSync(path.join(root, 'constants/Layout.ts'), 'utf8');

assert.match(
  flashCard,
  /const handleFrontPress = \(\) => \{[\s\S]*?speakWord\(word\.word, language\);\s*flipCard\(\);\s*\}/,
  'clicking the study card front must trigger pronunciation in the user gesture',
);
assert.match(
  firstLetterTrainer,
  /import \{ speakWord \} from '@\/lib\/speech'/,
  'first-letter review must import speakWord for gesture-driven auto pronunciation',
);
assert.match(
  firstLetterTrainer,
  /const startLetter = \(l: string\) => \{[\s\S]{0,300}?speakWord\(/,
  'tapping a letter must speak the first word synchronously inside the user gesture',
);
assert.match(
  firstLetterTrainer,
  /const goPrevWord = \(\) => \{[\s\S]{0,300}?speakWord\(/,
  'the previous-word button must speak the previous word synchronously in the user gesture',
);
assert.match(
  firstLetterTrainer,
  /const goNextWord = \(\) => \{[\s\S]{0,300}?speakWord\(/,
  'the next-word button must speak the next word synchronously in the user gesture',
);
assert.match(
  firstLetterTrainer,
  /onPress=\{isLast \? beginPractice : goNextWord\}/,
  'the next button must stay wired to the speaking handler',
);
assert.match(
  sessionProvider,
  /styles\.cloudLoginLayout/,
  'the cloud login screen must use a dedicated desktop-capable layout',
);
assert.match(
  sessionProvider,
  /cloudLoginPanel:/,
  'the cloud login screen must define a desktop login panel',
);
assert.match(
  speech,
  /DICT_AUDIO_ELEMENT_ID = 'wordhoard-tts-player'/,
  'web pronunciation must reuse a persistent audio element for PWA compatibility',
);
assert.match(
  speech,
  /document\.body\.appendChild\(audio\)/,
  'the web pronunciation player must stay attached to the page',
);
assert.match(
  speech,
  /if \(dictAudio\) return dictAudio/,
  'the web pronunciation player must be reused across card clicks',
);
assert.match(
  layout,
  /maxContentWidth: 920/,
  'desktop pages must use a desktop-sized content column rather than a phone-width column',
);

console.log('UI REGRESSION TESTS PASSED');
