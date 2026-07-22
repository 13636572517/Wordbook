import { postStudyLogs, repo } from '@/lib/data';
import { getRecentWords } from '@/lib/data/review-scope';
import { reviewWord } from '@/lib/data/review';
import { type RangeKind } from '@/lib/quizgen';
import { getLanguageByCode } from '@/lib/languages';
import { useSession } from '@/components/SessionProvider';
import useColors from '@/components/useColors';
import FlashCard from '@/components/FlashCard';
import QuizRunner from '@/components/QuizRunner';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import React, { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import type { Grade } from '@/lib/sm2';
import type { Word } from '@/lib/data';

// 云端模式开关（与 lib/data/index.ts 保持一致）
const USE_CLOUD = process.env.EXPO_PUBLIC_USE_CLOUD === 'true';
const ENGLISH = getLanguageByCode('en');

const REVIEW_GRADES: { grade: Grade; label: string; color: string }[] = [
  { grade: 0, label: 'Again', color: '#E5484D' },
  { grade: 1, label: 'Hard', color: '#F5A623' },
  { grade: 2, label: 'Good', color: '#30A46C' },
  { grade: 3, label: 'Easy', color: '#3B82F6' },
];

type QuizType = 'dictation' | 'choice' | 'phrase';
type QuizRange = 'all' | 'weak' | 'recent' | 'custom';
type Mode = 'menu' | 'quiz' | 'review';

const RANGES: { key: QuizRange; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'weak', label: '薄弱词' },
  { key: 'recent', label: '最近7天' },
  { key: 'custom', label: '自选' },
];
const TYPES: { key: QuizType; label: string }[] = [
  { key: 'dictation', label: '默写' },
  { key: 'choice', label: '选择' },
  { key: 'phrase', label: '词组' },
];
const REVIEW_DAYS = [7, 14, 30];

export default function PracticeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, wordbook } = useSession();

  const [mode, setMode] = useState<Mode>('menu');

  // 每日测试 设置
  const [quizRange, setQuizRange] = useState<QuizRange>('all');
  const [quizTypes, setQuizTypes] = useState<QuizType[]>([
    'dictation',
    'choice',
    'phrase',
  ]);

  // 复习 设置
  const [reviewDays, setReviewDays] = useState<number>(7);
  const [reviewWords, setReviewWords] = useState<Word[] | null>(null);
  const [reviewIdx, setReviewIdx] = useState(0);
  const [reviewFlipped, setReviewFlipped] = useState(false);
  const [reviewLoading, setReviewLoading] = useState(false);

  const toggleType = (k: QuizType) => {
    setQuizTypes((prev) =>
      prev.includes(k) ? prev.filter((x) => x !== k) : [...prev, k],
    );
  };

  // 范围 → pickRange 参数（自选暂以全部代替，留 TODO）
  const rangeParams = (): { range: RangeKind; opts?: { days?: number } } => {
    switch (quizRange) {
      case 'all':
        return { range: 'all' };
      case 'weak':
        return { range: 'weak' };
      case 'recent':
        return { range: 'recent', opts: { days: 7 } };
      case 'custom':
        // TODO: 自选范围暂以「全部」代替，后续支持从词本挑选若干词
        return { range: 'all' };
    }
  };

  const startQuiz = () => {
    if (quizTypes.length === 0) return;
    setMode('quiz');
  };

  const startReview = async () => {
    if (!user || !wordbook) return;
    setReviewLoading(true);
    const words = await getRecentWords(
      repo,
      user.id,
      wordbook.id,
      reviewDays,
      Date.now(),
    );
    setReviewWords(words);
    setReviewIdx(0);
    setReviewFlipped(false);
    setReviewLoading(false);
    setMode('review');
  };

  const recordReview = async (wordId: string, grade: Grade) => {
    if (!user || !wordbook) return;
    const now = Date.now();
    await reviewWord(repo, user.id, wordbook.id, wordId, grade, now);
    if (USE_CLOUD) {
      await postStudyLogs([{ wordbookId: wordbook.id, wordId, grade, ts: now }]);
    } else {
      await repo.addStudyLog({
        userId: user.id,
        wordbookId: wordbook.id,
        wordId,
        grade,
        ts: now,
        source: 'review',
      });
    }
  };

  const handleReviewGrade = async (grade: Grade) => {
    if (!reviewWords) return;
    const w = reviewWords[reviewIdx];
    await recordReview(w.id, grade);
    if (reviewIdx + 1 >= reviewWords.length) {
      setMode('menu');
      setReviewWords(null);
    } else {
      setReviewIdx(reviewIdx + 1);
      setReviewFlipped(false);
    }
  };

  // 从练习子页返回菜单时，确保复习数据被清掉
  useFocusEffect(
    useCallback(() => {
      setMode('menu');
      setReviewWords(null);
      setReviewFlipped(false);
    }, []),
  );

  const title = (
    <Text style={[styles.title, { color: colors.text }]}>练习</Text>
  );

  if (mode === 'quiz') {
    const { range, opts } = rangeParams();
    return (
      <View
        style={[
          styles.root,
          { backgroundColor: colors.background, paddingTop: insets.top },
        ]}
      >
        {title}
        <QuizRunner
          range={range}
          opts={opts}
          types={quizTypes}
          onExit={() => setMode('menu')}
        />
      </View>
    );
  }

  if (mode === 'review') {
    const done = reviewWords != null && reviewIdx >= reviewWords.length;
    return (
      <View
        style={[
          styles.root,
          { backgroundColor: colors.background, paddingTop: insets.top },
        ]}
      >
        {title}
        <View style={styles.reviewBody}>
          {reviewLoading ? (
            <ActivityIndicator size="large" color={colors.tint} />
          ) : reviewWords == null || reviewWords.length === 0 ? (
            <View style={styles.emptyBlock}>
              <Text style={[styles.emptyText, { color: colors.subtitle }]}>
                最近 {reviewDays} 天暂无学习记录
              </Text>
              <TouchableOpacity
                style={[styles.backBtn, { borderColor: colors.border }]}
                onPress={() => {
                  setMode('menu');
                  setReviewWords(null);
                }}
              >
                <Text style={[styles.backText, { color: colors.text }]}>
                  返回
                </Text>
              </TouchableOpacity>
            </View>
          ) : done ? (
            <View style={styles.emptyBlock}>
              <FontAwesome
                name="check-circle"
                size={48}
                color="#30A46C"
                style={{ marginBottom: 12 }}
              />
              <Text style={[styles.emptyText, { color: colors.text }]}>
                完成！本次复习了 {reviewWords.length} 个词
              </Text>
              <TouchableOpacity
                style={[styles.backBtn, { borderColor: colors.border }]}
                onPress={() => {
                  setMode('menu');
                  setReviewWords(null);
                }}
              >
                <Text style={[styles.backText, { color: colors.text }]}>
                  返回
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <Text style={[styles.reviewCount, { color: colors.subtitle }]}>
                第 {reviewIdx + 1} / {reviewWords.length} 词
              </Text>
              <FlashCard
                key={reviewIdx}
                word={reviewWords[reviewIdx]}
                language={ENGLISH}
                onFlip={setReviewFlipped}
              />
              {reviewFlipped ? (
                <View style={styles.gradeRow}>
                  {REVIEW_GRADES.map((g) => (
                    <TouchableOpacity
                      key={g.grade}
                      style={[styles.gradeButton, { backgroundColor: g.color }]}
                      onPress={() => handleReviewGrade(g.grade)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.gradeText}>{g.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : (
                <Text style={[styles.hint, { color: colors.pinyin }]}>
                  点击卡片翻面查看释义
                </Text>
              )}
            </>
          )}
        </View>
      </View>
    );
  }

  // 菜单：每日测试 + 复习 两个区块
  return (
    <View
      style={[
        styles.root,
        { backgroundColor: colors.background, paddingTop: insets.top },
      ]}
    >
      {title}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
      >
        {/* 每日测试 */}
        <Text style={[styles.sectionTitle, { color: colors.subtitle }]}>
          每日测试
        </Text>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>范围</Text>
          <View style={styles.chipRow}>
            {RANGES.map((r) => (
              <TouchableOpacity
                key={r.key}
                style={[
                  styles.chip,
                  {
                    backgroundColor:
                      quizRange === r.key ? colors.tint : colors.background,
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => setQuizRange(r.key)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: quizRange === r.key ? '#0D0D0D' : colors.text },
                  ]}
                >
                  {r.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {quizRange === 'custom' && (
            <Text style={[styles.todoNote, { color: colors.pinyin }]}>
              自选暂以「全部」代替（TODO）
            </Text>
          )}

          <Text style={[styles.fieldLabel, { color: colors.text, marginTop: 14 }]}>
            题型（可多选）
          </Text>
          <View style={styles.chipRow}>
            {TYPES.map((t) => {
              const on = quizTypes.includes(t.key);
              return (
                <TouchableOpacity
                  key={t.key}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: on ? colors.tint : colors.background,
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={() => toggleType(t.key)}
                  activeOpacity={0.8}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: on ? '#0D0D0D' : colors.text },
                    ]}
                  >
                    {t.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <TouchableOpacity
            style={[
              styles.primaryBtn,
              {
                backgroundColor: colors.tint,
                opacity: quizTypes.length > 0 ? 1 : 0.4,
              },
            ]}
            onPress={startQuiz}
            disabled={quizTypes.length === 0}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryText}>开始测试</Text>
          </TouchableOpacity>
        </View>

        {/* 复习 */}
        <Text style={[styles.sectionTitle, { color: colors.subtitle, marginTop: 22 }]}>
          复习
        </Text>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.fieldLabel, { color: colors.text }]}>
            最近 N 天学过的词
          </Text>
          <View style={styles.chipRow}>
            {REVIEW_DAYS.map((d) => (
              <TouchableOpacity
                key={d}
                style={[
                  styles.chip,
                  {
                    backgroundColor:
                      reviewDays === d ? colors.tint : colors.background,
                    borderColor: colors.border,
                  },
                ]}
                onPress={() => setReviewDays(d)}
                activeOpacity={0.8}
              >
                <Text
                  style={[
                    styles.chipText,
                    { color: reviewDays === d ? '#0D0D0D' : colors.text },
                  ]}
                >
                  {d} 天
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.tint }]}
            onPress={startReview}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryText}>开始复习</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  title: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 10,
  },
  card: {
    borderRadius: 16,
    padding: 18,
  },
  fieldLabel: {
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 10,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  chip: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  chipText: {
    fontSize: 15,
    fontWeight: '600',
  },
  todoNote: {
    fontSize: 12,
    marginTop: 8,
    fontStyle: 'italic',
  },
  primaryBtn: {
    borderRadius: 14,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 18,
  },
  primaryText: {
    color: '#0D0D0D',
    fontSize: 16,
    fontWeight: '700',
  },
  reviewBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  reviewCount: {
    fontSize: 14,
    marginBottom: 12,
  },
  gradeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 18,
    width: '100%',
  },
  gradeButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  gradeText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  hint: {
    marginTop: 22,
    fontSize: 13,
    letterSpacing: 0.3,
  },
  emptyBlock: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
  },
  emptyText: {
    fontSize: 16,
  },
  backBtn: {
    borderRadius: 14,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  backText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
