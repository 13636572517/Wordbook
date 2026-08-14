import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const flashCard = fs.readFileSync(path.join(root, 'components/FlashCard.tsx'), 'utf8');
const sessionProvider = fs.readFileSync(path.join(root, 'components/SessionProvider.tsx'), 'utf8');

assert.match(
  flashCard,
  /const handleFrontPress = \(\) => \{[\s\S]*?speakWord\(word\.word, language\);\s*flipCard\(\);\s*\}/,
  'clicking the study card front must trigger pronunciation in the user gesture',
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

console.log('UI REGRESSION TESTS PASSED');
