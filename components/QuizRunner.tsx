import { fetchSimilarWords, postStudyLogs, repo, httpRepo } from '@/lib/data';
import { reviewWord } from '@/lib/data/review';
import {
  genChoice,
  genDictation,
  genPhrase,
  genPhraseBlank,
  genSentenceChoice,
  pickRange,
  type ChoiceQuiz,
  type DictationQuiz,
  type PhraseBlankQuiz,
  type PhraseQuiz,
  type RangeKind,
  type SentenceChoiceQuiz,
} from '@/lib/quizgen';
import { useSession } from '@/components/SessionProvider';
import useColors from '@/components/useColors';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

// 云端模式开关（与 lib/data/index.ts 保持一致）
const isCloud = repo === httpRepo;

type QuizType = 'dictation' | 'choice' | 'phrase' | 'phrase-blank' | 'sentence-choice';
type Quiz = DictationQuiz | ChoiceQuiz | PhraseQuiz | PhraseBlankQuiz | SentenceChoiceQuiz;

interface ResultRow {
  word: string;
  answer: string;
  userAnswer: string;
  correct: boolean;
}

interface QuizRunnerProps {
  range: RangeKind;
  opts?: { days?: number; wordIds?: string[] };
  types: QuizType[];
  onExit?: (correct?: number, total?: number) => void;
}

// 本地打散（Fisher–Yates），避免依赖 quizgen 内部未导出函数
function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const GRADE_RIGHT = 2; // Good
const GRADE_WRONG = 0; // Again

export default function QuizRunner({
  range,
  opts,
  types,
  onExit,
}: QuizRunnerProps) {
  const colors = useColors();
  const { user, wordbook } = useSession();
  const [phase, setPhase] = useState<'loading' | 'quiz' | 'empty' | 'done'>(
    'loading',
  );
  const [questions, setQuestions] = useState<Quiz[]>([]);
  const [idx, setIdx] = useState(0);
  const [results, setResults] = useState<ResultRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!user || !wordbook) return;
      const now = Date.now();
      const words = await pickRange(repo, user.id, wordbook.id, range, {
        ...opts,
        now,
      });

      // 词组/例句题型需要完整词数据（云端 slim 不含 phrases/examples）
      const needsFullWord = types.some((t) =>
        ['phrase', 'phrase-blank', 'sentence-choice'].includes(t),
      );
      let quizWords = words;
      if (needsFullWord) {
        const enrichLimit = Math.min(words.length, 50);
        const enriched = await Promise.all(
          words.slice(0, enrichLimit).map(async (w) => {
            try {
              const full = await repo.getWord(w.id);
              return full ? { ...w, ...full } : w;
            } catch {
              return w;
            }
          }),
        );
        quizWords = [...enriched, ...words.slice(enrichLimit)];
      }

      const pool: Quiz[] = [];

      // 例句选择题需要异步获取近义词（最多 10 个词）
      let similarMap: Map<string, string[]> = new Map();
      if (types.includes('sentence-choice')) {
        const candidates = quizWords.slice(0, 10);
        const results = await Promise.allSettled(
          candidates.map((w) => fetchSimilarWords(w.word)),
        );
        candidates.forEach((w, i) => {
          const r = results[i];
          if (r.status === 'fulfilled' && r.value.length >= 3) {
            similarMap.set(w.id, r.value);
          }
        });
      }

      for (const w of quizWords) {
        for (const t of types) {
          if (t === 'dictation') {
            pool.push(genDictation([w]));
          } else if (t === 'choice') {
            pool.push(genChoice(quizWords, w));
          } else if (t === 'phrase') {
            const q = genPhrase(w);
            if (q) pool.push(q);
          } else if (t === 'phrase-blank') {
            const q = genPhraseBlank(w);
            if (q) pool.push(q);
          } else if (t === 'sentence-choice') {
            const similar = similarMap.get(w.id);
            if (similar) {
              const q = genSentenceChoice(w, similar);
              if (q) pool.push(q);
            }
          }
        }
      }
      if (cancelled) return;
      if (pool.length === 0) {
        setPhase('empty');
        return;
      }
      setQuestions(shuffle(pool));
      setPhase('quiz');
    })();
    return () => {
      cancelled = true;
    };
  }, [user, wordbook]);

  // 判定后：对=Good(2)/错=Again(0)，复用 reviewWord + 写 studylog(source:'quiz')
  const recordGrade = async (wordId: string, correct: boolean) => {
    if (!user || !wordbook) return;
    const grade = correct ? GRADE_RIGHT : GRADE_WRONG;
    const now = Date.now();
    await reviewWord(repo, user.id, wordbook.id, wordId, grade, now);
    if (isCloud) {
      await postStudyLogs([
        { wordbookId: wordbook.id, wordId, grade, ts: now, source: 'quiz' },
      ]);
    } else {
      await repo.addStudyLog({
        userId: user.id,
        wordbookId: wordbook.id,
        wordId,
        grade,
        ts: now,
        source: 'quiz',
      });
    }
  };

  const handleGrade = async (correct: boolean, userAnswer: string) => {
    const q = questions[idx];
    if (!q) return;
    await recordGrade(q.word.id, correct);
    setResults((prev) => [
      ...prev,
      { word: q.word.word, answer: q.answer, userAnswer, correct },
    ]);
  };

  const handleNext = () => {
    if (idx + 1 >= questions.length) setPhase('done');
    else setIdx(idx + 1);
  };

  if (phase === 'loading') {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.tint} />
      </View>
    );
  }

  if (phase === 'empty') {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.emptyText, { color: colors.subtitle }]}>
          该范围暂无单词
        </Text>
        {onExit && (
          <TouchableOpacity style={styles.exitBtn} onPress={() => onExit()}>
            <Text style={styles.exitText}>返回</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  if (phase === 'done') {
    return <DoneScreen results={results} onExit={onExit} />;
  }

  const q = questions[idx];
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.progressRow}>
        <Text style={[styles.progressText, { color: colors.subtitle }]}>
          第 {idx + 1} / {questions.length} 题
        </Text>
        {onExit && (
          <TouchableOpacity onPress={() => onExit()} hitSlop={8}>
            <FontAwesome name="times" size={18} color={colors.subtitle} />
          </TouchableOpacity>
        )}
      </View>
      <QuestionCard
        key={idx}
        quiz={q}
        onGrade={handleGrade}
        onNext={handleNext}
        isLast={idx + 1 >= questions.length}
      />
    </View>
  );
}

function QuestionCard({
  quiz,
  onGrade,
  onNext,
  isLast,
}: {
  quiz: Quiz;
  onGrade: (correct: boolean, userAnswer: string) => void | Promise<void>;
  onNext: () => void;
  isLast: boolean;
}) {
  const colors = useColors();
  const [input, setInput] = useState('');
  const [graded, setGraded] = useState(false);
  const [correct, setCorrect] = useState(false);
  const [grading, setGrading] = useState(false);

  const grade = async (ans: string) => {
    if (graded || grading) return;
    setGrading(true);
    const ok =
      ans.trim().toLowerCase() === quiz.answer.trim().toLowerCase();
    setCorrect(ok);
    setGraded(true);
    await onGrade(ok, ans);
    setGrading(false);
    // 答对自动跳转下一题，答错留给用户看完反馈
    if (ok) setTimeout(() => onNext(), 700);
  };

  const submit = () => {
    if (!graded) grade(input);
  };

  return (
    <View style={styles.qCard}>
      {/* 题干区：按题型展示 */}
      {quiz.type === 'dictation' && (
        <>
          <Text style={[styles.qPrompt, { color: colors.subtitle }]}>
            看释义拼写英文单词
          </Text>
          <Text style={[styles.qHeadline, { color: colors.text }]}>
            {quiz.word.translation}
          </Text>
        </>
      )}
      {quiz.type === 'choice' && (
        <>
          <Text style={[styles.qPrompt, { color: colors.subtitle }]}>
            选择正确的释义
          </Text>
          <Text style={[styles.qHeadline, { color: colors.text }]}>
            {quiz.word.word}
          </Text>
          <View style={styles.optionsWrap}>
            {quiz.options.map((opt, i) => {
              const chosen = graded && input === opt;
              const isAnswer = opt === quiz.answer;
              const bg = graded
                ? isAnswer
                  ? '#30A46C'
                  : chosen
                    ? '#E5484D'
                    : colors.card
                : colors.card;
              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.optionBtn, { backgroundColor: bg }]}
                  onPress={() => grade(opt)}
                  disabled={graded}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.optionText,
                      { color: graded && (isAnswer || chosen) ? '#FFF' : colors.text },
                    ]}
                  >
                    {opt}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}
      {quiz.type === 'phrase' && (
        <>
          <Text style={[styles.qPrompt, { color: colors.subtitle }]}>
            默写词组（整组对才对）
          </Text>
          <Text style={[styles.qHeadline, { color: colors.text }]}>
            {quiz.meaning}
          </Text>
          <Text style={[styles.hintText, { color: colors.pinyin }]}>
            {quiz.hints.map((h) => '_ '.repeat(h).trim()).join('    ')}
          </Text>
        </>
      )}
      {quiz.type === 'phrase-blank' && (
        <>
          <Text style={[styles.qPrompt, { color: colors.subtitle }]}>
            根据词组释义，填写缺失的单词
          </Text>
          <Text style={[styles.qHeadline, { color: colors.text }]}>
            {quiz.blanked}
          </Text>
          <Text style={[styles.hintText, { color: colors.pinyin }]}>
            {quiz.meaning}（{quiz.hintLength}个字母）
          </Text>
        </>
      )}
      {quiz.type === 'sentence-choice' && (
        <>
          <Text style={[styles.qPrompt, { color: colors.subtitle }]}>
            选择正确的单词填入例句
          </Text>
          <Text style={[styles.qHeadline, { color: colors.text, fontSize: 20 }]}>
            {quiz.sentence}
          </Text>
          {quiz.sentenceZh ? (
            <Text style={[styles.hintText, { color: colors.pinyin, fontSize: 14 }]}>
              {quiz.sentenceZh}
            </Text>
          ) : null}
          <View style={styles.optionsWrap}>
            {quiz.options.map((opt, i) => {
              const chosen = graded && input === opt;
              const isAnswer = opt === quiz.answer;
              const bg = graded
                ? isAnswer
                  ? '#30A46C'
                  : chosen
                    ? '#E5484D'
                    : colors.card
                : colors.card;
              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.optionBtn, { backgroundColor: bg }]}
                  onPress={() => grade(opt)}
                  disabled={graded}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.optionText,
                      { color: graded && (isAnswer || chosen) ? '#FFF' : colors.text },
                    ]}
                  >
                    {opt}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </>
      )}

      {/* 输入区（dictation / phrase / phrase-blank） */}
      {quiz.type !== 'choice' && quiz.type !== 'sentence-choice' && (
        <View style={styles.inputWrap}>
          <TextInput
            style={[
              styles.input,
              {
                backgroundColor: colors.inputBackground,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
            value={input}
            onChangeText={(t) => {
              if (!graded) setInput(t);
            }}
            placeholder="输入答案"
            placeholderTextColor={colors.subtitle}
            editable={!graded}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            onSubmitEditing={submit}
          />
          {!graded && (
            <TouchableOpacity
              style={[styles.submitBtn, { backgroundColor: colors.tint }]}
              onPress={submit}
              activeOpacity={0.8}
            >
              <Text style={styles.submitText}>检查</Text>
            </TouchableOpacity>
          )}
        </View>
      )}

      {/* 判定后反馈 */}
      {graded && (
        <View style={styles.feedbackWrap}>
          <View
            style={[
              styles.markBadge,
              { backgroundColor: correct ? '#30A46C' : '#E5484D' },
            ]}
          >
            <FontAwesome
              name={correct ? 'check' : 'times'}
              size={16}
              color="#FFF"
            />
            <Text style={styles.markText}>{correct ? '答对' : '答错'}</Text>
          </View>
          <Text style={[styles.answerLine, { color: colors.subtitle }]}>
            正确答案：{quiz.answer}
          </Text>
          <TouchableOpacity
            style={[styles.nextBtn, { backgroundColor: colors.tint }]}
            onPress={onNext}
            activeOpacity={0.8}
          >
            <Text style={styles.nextText}>
              {isLast ? '查看结果' : '下一题'}
            </Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function DoneScreen({
  results,
  onExit,
}: {
  results: ResultRow[];
  onExit?: (correct?: number, total?: number) => void;
}) {
  const colors = useColors();
  const total = results.length;
  const right = results.filter((r) => r.correct).length;
  const pct = total > 0 ? Math.round((right / total) * 100) : 0;
  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.doneContent}
    >
      <Text style={[styles.doneTitle, { color: colors.text }]}>测试完成</Text>
      <View style={[styles.rateCard, { backgroundColor: colors.card }]}>
        <Text style={[styles.rateBig, { color: '#30A46C' }]}>{pct}%</Text>
        <Text style={[styles.rateSub, { color: colors.subtitle }]}>
          正确率 {right} / {total}
        </Text>
      </View>

      <Text style={[styles.reviewHeading, { color: colors.subtitle }]}>
        逐题回顾
      </Text>
      {results.map((r, i) => (
        <View
          key={i}
          style={[styles.reviewRow, { borderColor: colors.border }]}
        >
          <View style={styles.reviewMain}>
            <Text style={[styles.reviewWord, { color: colors.text }]}>
              {r.word}
            </Text>
            <Text style={[styles.reviewSub, { color: colors.subtitle }]}>
              正确答案：{r.answer}
            </Text>
            <Text style={[styles.reviewSub, { color: colors.subtitle }]}>
              你的答案：{r.userAnswer || '(空)'}
            </Text>
          </View>
          <FontAwesome
            name={r.correct ? 'check-circle' : 'times-circle'}
            size={22}
            color={r.correct ? '#30A46C' : '#E5484D'}
          />
        </View>
      ))}

      {onExit && (
        <TouchableOpacity
          style={[styles.exitBtn, { borderColor: colors.border }]}
          onPress={() => onExit(right, total)}
        >
          <Text style={[styles.exitText, { color: colors.text }]}>返回</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    gap: 16,
  },
  emptyText: { fontSize: 16 },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  progressText: { fontSize: 14 },
  qCard: { marginTop: 4 },
  qPrompt: { fontSize: 14, marginBottom: 8 },
  qHeadline: {
    fontSize: 30,
    fontWeight: '800',
    marginBottom: 16,
    textTransform: 'capitalize',
  },
  optionsWrap: { gap: 10 },
  optionBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
  },
  optionText: { fontSize: 17, fontWeight: '600' },
  hintText: {
    fontSize: 22,
    letterSpacing: 2,
    marginBottom: 16,
  },
  inputWrap: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 17,
  },
  submitBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 22,
  },
  submitText: { color: '#0D0D0D', fontWeight: '700', fontSize: 16 },
  feedbackWrap: { marginTop: 18, gap: 12 },
  markBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  markText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  answerLine: { fontSize: 15 },
  nextBtn: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  nextText: { color: '#0D0D0D', fontWeight: '700', fontSize: 16 },
  doneContent: { paddingBottom: 40, gap: 14 },
  doneTitle: { fontSize: 24, fontWeight: '800', paddingVertical: 8 },
  rateCard: {
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
  },
  rateBig: { fontSize: 40, fontWeight: '800' },
  rateSub: { fontSize: 15, marginTop: 4 },
  reviewHeading: { fontSize: 13, fontWeight: '600', marginTop: 8 },
  reviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  reviewMain: { flex: 1, marginRight: 12 },
  reviewWord: { fontSize: 17, fontWeight: '700' },
  reviewSub: { fontSize: 13, marginTop: 2 },
  exitBtn: {
    marginTop: 16,
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 14,
    alignItems: 'center',
  },
  exitText: { fontSize: 16, fontWeight: '600' },
});
