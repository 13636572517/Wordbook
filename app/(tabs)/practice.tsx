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

type QuizType = 'dictation' | 'choice' | 'phrase' | 'phrase-blank' | 'sentence-choice';
type QuizRange = 'studied' | 'weak' | 'recent';
type Mode = 'menu' | 'quiz' | 'review';

const RANGES: { key: QuizRange; label: string }[] = [
  { key: 'studied', label: '全部已学' },
  { key: 'weak', label: '薄弱词' },
  { key: 'recent', label: '最近7天' },
];
const TYPES: { key: QuizType; label: string; icon: React.ComponentProps<typeof FontAwesome>['name']; desc: string }[] = [
  { key: 'dictation', label: '默写', icon: 'pencil', desc: '看释义拼写单词' },
  { key: 'choice', label: '选择', icon: 'list', desc: '四选一选释义' },
  { key: 'phrase', label: '词组默写', icon: 'font', desc: '看释义写词组' },
  { key: 'phrase-blank', label: '词组填空', icon: 'puzzle-piece', desc: '语境中填单词' },
  { key: 'sentence-choice', label: '例句选择', icon: 'comment', desc: '例句中四选一' },
];
const REVIEW_DAYS = [7, 14, 30];

export default function PracticeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, wordbook } = useSession();

  const [mode, setMode] = useState<Mode>('menu');

  // 每日测试 设置（默认「全部已学」——只测已学过的词）
  const [quizRange, setQuizRange] = useState<QuizRange>('studied');
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

  // 范围 → pickRange 参数。三种范围都只覆盖「当前词本已学过的词」：
  //  - studied：全部已学  - weak：已学中的薄弱词  - recent：最近 7 天学过的词
  const rangeParams = (): { range: RangeKind; opts?: { days?: number } } => {
    switch (quizRange) {
      case 'studied':
        return { range: 'studied' };
      case 'weak':
        return { range: 'weak' };
      case 'recent':
        return { range: 'recent', opts: { days: 7 } };
    }
  };

  const startQuiz = (type?: QuizType) => {
    if (type) setQuizTypes([type]);
    if (quizTypes.length === 0 && !type) return;
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
      await postStudyLogs([{ wordbookId: wordbook.id, wordId, grade, ts: now, source: 'review' }]);
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

  // 菜单：题型卡片 + 复习
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
        {/* 范围选择 */}
        <Text style={[styles.scopeHint, { color: colors.pinyin }]}>
          测试「{wordbook?.name ?? '当前词本'}」中已学过的单词
        </Text>
        <View style={styles.chipRow}>
          {RANGES.map((r) => (
            <TouchableOpacity
              key={r.key}
              style={[
                styles.chip,
                {
                  backgroundColor:
                    quizRange === r.key ? colors.tint : colors.card,
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

        {/* 题型卡片网格 */}
        <Text style={[styles.sectionTitle, { color: colors.subtitle, marginTop: 18 }]}>
          选择题型
        </Text>
        <View style={styles.typeGrid}>
          {TYPES.map((t) => (
            <TouchableOpacity
              key={t.key}
              style={[styles.typeCard, { backgroundColor: colors.card }]}
              onPress={() => startQuiz(t.key)}
              activeOpacity={0.7}
            >
              <View style={[styles.typeIconWrap, { backgroundColor: colors.tint + '22' }]}>
                <FontAwesome name={t.icon} size={20} color={colors.tint} />
              </View>
              <Text style={[styles.typeLabel, { color: colors.text }]}>
                {t.label}
              </Text>
              <Text style={[styles.typeDesc, { color: colors.subtitle }]} numberOfLines={1}>
                {t.desc}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* 复习 */}
        <Text style={[styles.sectionTitle, { color: colors.subtitle, marginTop: 22 }]}>
          复习
        </Text>
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.scopeHint, { color: colors.pinyin }]}>
            复习「{wordbook?.name ?? '当前词本'}」中最近学过的单词
          </Text>
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
  typeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  typeCard: {
    width: '47%',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    gap: 6,
  },
  typeIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  typeLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  typeDesc: {
    fontSize: 12,
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
  scopeHint: {
    fontSize: 12.5,
    lineHeight: 18,
    marginBottom: 14,
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
