import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  Text,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useColors from '@/components/useColors';
import { repo, httpRepo, postStudyLogs } from '@/lib/data';
import type { Word } from '@/lib/data';
import { getNextQuizWord, getTodayNewWordCount } from '@/lib/data/quiz';
import { getDailyNewWordGoal } from '@/lib/data/settings';
import { reviewWord } from '@/lib/data/review';
import type { WordbookStats } from '@/lib/data/stats';
import { Grade } from '@/lib/sm2';
import { getPriorityIds, clearPriorityIds } from '@/lib/quizSelection';
import { getLanguageByCode } from '@/lib/languages';
import { useSession } from '@/components/SessionProvider';
import FlashCard from '@/components/FlashCard';
import { speakWord } from '@/lib/speech';
import { fetchWordDetail } from '@/lib/data/httpRepo';
import QuizRunner from '@/components/QuizRunner';
import { useWebAlert } from '@/components/WebAlert';

const ENGLISH = getLanguageByCode('en');
// 云端模式判定改用运行时比较（repo===httpRepo），不再依赖编译期
// EXPO_PUBLIC_USE_CLOUD 常量——该常量曾被 Metro 缓存固化成 false，
// 导致学习页「异步补充释义」整段被死代码消除（只见翻译、不见释义/例句/词组）。
const isCloud = repo === httpRepo;
const GRADES: { grade: Grade; label: string; cn: string; color: string }[] = [
  { grade: 0, label: 'Again', cn: '不会', color: '#E5484D' },
  { grade: 1, label: 'Hard', cn: '模糊', color: '#F5A623' },
  { grade: 2, label: 'Good', cn: '认识', color: '#30A46C' },
  { grade: 3, label: 'Easy', cn: '很熟', color: '#3B82F6' },
];

type ReviewPhase =
  | null
  | 'fetching'   // 正在获取今日新词
  | 'flashcards' // 闪卡滚3遍
  | 'choice'     // 选择释义测验
  | 'dictation'  // 默写测验
  | 'done';      // 完成，显示结果

export default function HomeScreen() {
  const [word, setWord] = useState<Word | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [stats, setStats] = useState<WordbookStats | null>(null);
  const [loading, setLoading] = useState(true);
  // 首页加载失败时的错误提示（不再无限转圈，显示错误+重试）
  const [loadError, setLoadError] = useState<string | null>(null);
  // 当前词的已学习次数（repetitions），用于显示「已掌握 x/3」
  const [reps, setReps] = useState(0);
  // 当前词是否为复习词（有历史进度），用于显示「复习」标识
  const [isReview, setIsReview] = useState(false);
  // 加练模式：null=未激活，number=本轮剩余新词数（每轮10个，可多轮）
  const [extraRemaining, setExtraRemaining] = useState<number | null>(null);
  const extraRemainingRef = useRef<number | null>(null);
  // 巩固测试是否已完成（完成后不再显示“开始巩固测试”按钮）
  const [reviewCompleted, setReviewCompleted] = useState(false);
  const [cardKey, setCardKey] = useState(0);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, wordbook } = useSession();
  const webAlert = useWebAlert();
  const activeWbRef = useRef<string | null>(null);
  const hasWordRef = useRef(false);

  // 复习测试流程
  const [reviewPhase, setReviewPhase] = useState<ReviewPhase>(null);
  const [todayReviewWords, setTodayReviewWords] = useState<Word[]>([]);
  const [reviewFlashIdx, setReviewFlashIdx] = useState(0);   // flashcard 当前索引
  const [reviewFlashPass, setReviewFlashPass] = useState(0); // 当前第几遍 (0-2)
  const [reviewFlipped, setReviewFlipped] = useState(false);
  const [reviewChoiceScore, setReviewChoiceScore] = useState<{ correct: number; total: number } | null>(null);
  const [reviewDictScore, setReviewDictScore] = useState<{ correct: number; total: number } | null>(null);
  const todayCountRef = useRef(0);
  const dailyGoalRef = useRef(0);

  const loadNext = useCallback(async () => {
    if (!user || !wordbook) return;
    setLoadError(null);
    const now = Date.now();
    try {
      // 每日新词上限：并行取全局目标值与今日已学新词数（getDailyNewWordGoal 走 AsyncStorage）
      const [goal, todayCount] = await Promise.all([
        getDailyNewWordGoal(user.id),
        getTodayNewWordCount(repo, user.id, wordbook.id, now),
      ]);
      dailyGoalRef.current = goal;
      todayCountRef.current = todayCount;
      const prio = getPriorityIds();
      // 加练模式下绕过每日新词上限
      const inExtra = extraRemainingRef.current != null && extraRemainingRef.current > 0;
      // 每日目标已完成且非加练模式：不再自动加载单词（包括复习词），
      // 显示"今日已学完"页面，复习通过"巩固测试"或"练习"Tab 进入
      if (!inExtra && todayCount >= goal && goal > 0 && prio.length === 0) {
        setWord(null);
        hasWordRef.current = false;
        const s = await repo.getWordbookStats(user.id, wordbook.id, now);
        setStats(s);
        setLoading(false);
        return;
      }
      const effectiveGoal = inExtra ? Number.POSITIVE_INFINITY : goal;
      const effectiveCount = inExtra ? 0 : todayCount;
      // 加练模式只学新词，跳过复习词（学完后统一进入巩固测试）
      const [w, s] = await Promise.all([
        getNextQuizWord(repo, user.id, wordbook.id, prio, now, effectiveGoal, effectiveCount, inExtra),
        repo.getWordbookStats(user.id, wordbook.id, now),
      ]);
      // 取当前词的已学习次数，用于「已掌握 x/3」展示
      const prog = w ? await repo.getProgress(user.id, wordbook.id, w.id) : null;
      setReps(prog?.repetitions ?? 0);
      // 复习词判定：有进度且有正确/错误记录 → 之前学过
      setIsReview(prog != null && (prog.correct + prog.wrong) > 0);
      clearPriorityIds();
      setWord(w);
      hasWordRef.current = w != null;
      setStats(s);
      setIsFlipped(false);
      setCardKey((k) => k + 1);
      setLoading(false);
      // 新词自动播放发音
      if (w) speakWord(w.word, ENGLISH);
      // 云端模式：slim 词表不含释义大字段，选中单词后异步拉取
      // 完整数据（释义/词组/例句）合并到卡片，不阻塞显示。
      // 用运行时 isCloud（repo===httpRepo）判定，避免编译期 USE_CLOUD 被
      // 死代码消除；只要当前词还没释义就补充，本地模式词已自带释义会跳过。
      if (isCloud && w && (!w.definitions || w.definitions.length === 0)) {
        const wid = w.id;
        (async () => {
          try {
            const full = await fetchWordDetail(wid);
            // 仅当还是同一张卡时才更新，避免旧响应覆盖新词
            setWord((cur) => (cur && cur.id === wid ? { ...cur, ...full } : cur));
          } catch (e) {
            // 释义补充失败不应静默吞掉，便于排查
            console.warn('释义补充失败', e);
          }
        })();
      }
    } catch (e: any) {
      // 任何接口异常都停止转圈并提示错误，避免无限等待
      console.error('首页加载失败', e);
      setLoadError(e?.message || '加载失败，请重试');
      setLoading(false);
    }
  }, [user, wordbook]);

  const retryLoad = useCallback(() => {
    setLoadError(null);
    setLoading(true);
    loadNext();
  }, [loadNext]);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        if (!user || !wordbook) return;
        const changed = activeWbRef.current !== wordbook.id;
        activeWbRef.current = wordbook.id;
        const hasPrio = getPriorityIds().length > 0;
        if (changed || !hasWordRef.current || hasPrio) {
          setLoading(true);
          await loadNext();
        } else {
          setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [user, wordbook, loadNext]),
  );

  const handleGrade = async (grade: Grade) => {
    if (word && user && wordbook) {
      const now = Date.now();
      // 新词判定：此前无进度即首次学习，记录 isNew 供每日新词上限统计
      const existing = await repo.getProgress(user.id, wordbook.id, word.id);
      const isNew = existing == null;
      await reviewWord(repo, user.id, wordbook.id, word.id, grade, now);
      // 修 StudyLog 断点：评分后上报学习日志（本地经 repo，云端经 httpRepo）
      if (isCloud) {
        await postStudyLogs([{ wordbookId: wordbook.id, wordId: word.id, grade, ts: now, source: 'study', isNew }]);
      } else {
        await repo.addStudyLog({
          userId: user.id,
          wordbookId: wordbook.id,
          wordId: word.id,
          grade,
          ts: now,
          source: 'study',
          isNew,
        });
      }
      // 加练模式：新词评分后递减剩余数
      if (isNew && extraRemainingRef.current != null && extraRemainingRef.current > 0) {
        const next = extraRemainingRef.current - 1;
        extraRemainingRef.current = next;
        setExtraRemaining(next);
      }
      // 必须 await：确保下一词选词（读取进度）发生在 setProgress 的 PUT
      // 落库完成之后，否则进度缓存会读到旧值，刚学过的词仍被当作新词
      // 重新选中，导致卡在单个词无限循环。
      await loadNext();
    }
  };

  // 获取今日新学单词的完整数据
  const fetchTodayReviewWords = useCallback(async (): Promise<Word[]> => {
    if (!user || !wordbook) return [];
    const now = Date.now();
    const logs = await repo.listStudyLogs(user.id, wordbook.id, {
      sinceTs: (() => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d.getTime(); })(),
      isNew: true,
    });
    const wordIds = [...new Set(logs.map((l) => l.wordId))];
    const words = await Promise.all(
      wordIds.map(async (id) => {
        const w = await repo.getWord(id);
        return w;
      }),
    );
    return words.filter((w): w is Word => w != null);
  }, [user, wordbook]);

  // 加练确认：弹窗二次确认后启动加练模式（每轮+10新词）
  const confirmExtraPractice = useCallback(() => {
    webAlert(
      '继续学习',
      '今日目标已完成，确定要继续学习 10 个新词吗？',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '确定',
          onPress: () => {
            extraRemainingRef.current = 10;
            setExtraRemaining(10);
            loadNext();
          },
        },
      ],
    );
  }, [loadNext, webAlert]);

  // 开始复习测试流程
  const startReview = useCallback(async () => {
    setReviewPhase('fetching');
    const words = await fetchTodayReviewWords();
    if (words.length === 0) {
      setReviewPhase(null);
      return;
    }
    setTodayReviewWords(words);
    setReviewFlashIdx(0);
    setReviewFlashPass(0);
    setReviewFlipped(false);
    setReviewChoiceScore(null);
    setReviewDictScore(null);
    setReviewPhase('flashcards');
  }, [fetchTodayReviewWords]);

  // 闪卡复习：翻面
  const onReviewFlip = useCallback(() => {
    setReviewFlipped((f) => !f);
  }, []);

  // 闪卡复习：认识(继续下一张) / 不认识(保留在队列末尾)
  const onReviewKnow = useCallback((know: boolean) => {
    setReviewFlipped(false);
    setTodayReviewWords((words) => {
      const w = words[reviewFlashIdx];
      if (!know) {
        // 不认识：移到末尾再滚一次
        return [...words.slice(0, reviewFlashIdx), ...words.slice(reviewFlashIdx + 1), w];
      }
      return words;
    });
    setReviewFlashIdx((idx) => {
      const limit = todayReviewWords.length;
      if (!know) {
        // 不认识：词移走后下一词滑入当前位置，不递增 idx
        // 但仍需检查本遍是否结束（当前词是最后一个且被移走）
        if (idx + 1 >= limit) {
          if (reviewFlashPass + 1 >= 3) {
            setReviewPhase('choice');
            return 0;
          }
          setReviewFlashPass((p) => p + 1);
          return 0;
        }
        return idx; // 保持不动，下一词已滑入
      }
      // 认识：正常前进
      if (idx + 1 >= limit) {
        if (reviewFlashPass + 1 >= 3) {
          setReviewPhase('choice');
          return 0;
        }
        setReviewFlashPass((p) => p + 1);
        return 0;
      }
      return idx + 1;
    });
  }, [reviewFlashIdx, reviewFlashPass, todayReviewWords]);

  // 选择测试完成
  const onChoiceDone = useCallback((correct: number, total: number) => {
    setReviewChoiceScore({ correct, total });
    setReviewPhase('dictation');
  }, []);

  // 默写测试完成
  const onDictDone = useCallback((correct: number, total: number) => {
    setReviewDictScore({ correct, total });
    setReviewPhase('done');
  }, []);

  // 退出复习（返回正常学习模式）
  const exitReview = useCallback(() => {
    setReviewPhase(null);
    setTodayReviewWords([]);
    // 巩固流程走完后标记已完成，不再重复显示“开始巩固测试”
    setReviewCompleted(true);
    loadNext();
  }, [loadNext]);

  if (loadError) {
    return (
      <View
        style={[
          styles.container,
          {
            backgroundColor: colors.background,
            paddingTop: insets.top,
            alignItems: 'center',
            justifyContent: 'center',
          },
        ]}
      >
        <Text style={[styles.errorTitle, { color: colors.text }]}>加载失败了</Text>
        <Text style={[styles.errorSub, { color: colors.subtitle }]}>
          {loadError}
        </Text>
        <TouchableOpacity
          style={[styles.retryButton, { backgroundColor: colors.tint }]}
          onPress={retryLoad}
          activeOpacity={0.8}
        >
          <Text style={styles.retryText}>重试</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (loading || !user || !wordbook) {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: colors.background, paddingTop: insets.top },
        ]}
      >
        <ActivityIndicator size="large" color={colors.tint} />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: insets.top },
      ]}
    >
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.titleWrap}
          onPress={() => router.push('/library')}
          activeOpacity={0.7}
        >
          <Text style={[styles.title, { color: colors.text }]}>
            {wordbook.name}
          </Text>
          <FontAwesome
            name="chevron-right"
            size={13}
            color={colors.subtitle}
            style={{ marginLeft: 6 }}
          />
        </TouchableOpacity>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: colors.tint }]}
            onPress={() => router.push('/add-modal')}
            activeOpacity={0.7}
          >
            <FontAwesome name="plus" size={18} color="#0D0D0D" />
          </TouchableOpacity>
        </View>
      </View>

      {stats && (
        <View style={styles.statsRow}>
          <StatChip
            icon="fire"
            value={String(stats.streak)}
            label="天连续"
            color={colors.tint}
          />
          <StatChip
            icon="clock-o"
            value={String(stats.due)}
            label="待复习"
            color="#F5A623"
          />
          <StatChip
            icon="star"
            value={String(stats.mastered)}
            label="已掌握"
            color="#30A46C"
          />
          <StatChip
            icon="percent"
            value={`${Math.round(stats.accuracy * 100)}%`}
            label="正确率"
            color="#3B82F6"
          />
        </View>
      )}

      {/* --- 复习测试流程 --- */}
      {reviewPhase === 'flashcards' && todayReviewWords.length > 0 && (
        <View style={styles.reviewArea}>
          <View style={styles.reviewProgress}>
            <Text style={[styles.reviewProgressText, { color: colors.subtitle }]}>
              巩固复习 · 第 {reviewFlashPass + 1}/3 遍 · 第 {reviewFlashIdx + 1}/{todayReviewWords.length} 词
            </Text>
            <TouchableOpacity onPress={exitReview}>
              <FontAwesome name="times" size={16} color={colors.subtitle} />
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            style={[styles.reviewCard, { backgroundColor: colors.card }]}
            onPress={onReviewFlip}
            activeOpacity={0.8}
          >
            {reviewFlipped ? (
              <View style={styles.reviewCardBack}>
                <Text style={[styles.reviewWord, { color: colors.text }]}>
                  {todayReviewWords[reviewFlashIdx]?.word ?? ''}
                </Text>
                <Text style={[styles.reviewTrans, { color: colors.subtitle }]}>
                  {todayReviewWords[reviewFlashIdx]?.translation ?? ''}
                </Text>
              </View>
            ) : (
              <Text style={[styles.reviewWord, { color: colors.text }]}>
                {todayReviewWords[reviewFlashIdx]?.word ?? ''}
              </Text>
            )}
          </TouchableOpacity>
          {reviewFlipped && (
            <View style={styles.reviewButtons}>
              <TouchableOpacity
                style={[styles.reviewBtn, { backgroundColor: '#E5484D' }]}
                onPress={() => onReviewKnow(false)}
              >
                <Text style={styles.reviewBtnText}>不认识</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.reviewBtn, { backgroundColor: '#30A46C' }]}
                onPress={() => onReviewKnow(true)}
              >
                <Text style={styles.reviewBtnText}>认识</Text>
              </TouchableOpacity>
            </View>
          )}
          {!reviewFlipped && (
            <Text style={[styles.hint, { color: colors.pinyin }]}>
              点击卡片查看释义
            </Text>
          )}
        </View>
      )}

      {reviewPhase === 'choice' && (
        <View style={{ flex: 1 }}>
          <QuizRunner
            range="custom"
            types={['choice']}
            opts={{ wordIds: todayReviewWords.map((w) => w.id) }}
            onExit={(correct, total) => {
              // X 按钮无参数 → 退出复习；完成返回有分数 → 进入下一环节
              if (correct === undefined) { exitReview(); return; }
              onChoiceDone(correct, total ?? 0);
            }}
          />
        </View>
      )}

      {reviewPhase === 'dictation' && (
        <View style={{ flex: 1 }}>
          <QuizRunner
            range="custom"
            types={['dictation']}
            opts={{ wordIds: todayReviewWords.map((w) => w.id) }}
            onExit={(correct, total) => {
              if (correct === undefined) { exitReview(); return; }
              onDictDone(correct, total ?? 0);
            }}
          />
        </View>
      )}

      {reviewPhase === 'done' && (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyIcon, { color: colors.subtitle }]}>✅</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            巩固完成！
          </Text>
          {reviewChoiceScore && (
            <Text style={[styles.emptySubtitle, { color: colors.subtitle }]}>
              选择释义：{reviewChoiceScore.correct}/{reviewChoiceScore.total}
            </Text>
          )}
          {reviewDictScore && (
            <Text style={[styles.emptySubtitle, { color: colors.subtitle }]}>
              默写：{reviewDictScore.correct}/{reviewDictScore.total}
            </Text>
          )}
          <TouchableOpacity
            style={[styles.reviewStartBtn, { backgroundColor: colors.tint }]}
            onPress={exitReview}
          >
            <Text style={[styles.reviewStartText, { color: '#0D0D0D' }]}>
              返回学习
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {reviewPhase === 'fetching' && (
        <View style={styles.emptyContainer}>
          <ActivityIndicator size="large" color={colors.tint} />
          <Text style={[styles.emptySubtitle, { color: colors.subtitle, marginTop: 16 }]}>
            正在准备复习内容...
          </Text>
        </View>
      )}

      {/* --- 正常学习模式 --- */}
      {!reviewPhase && !word ? (
        <ScrollView
          style={styles.emptyScroll}
          contentContainerStyle={styles.emptyContainer}
        >
          {todayCountRef.current >= dailyGoalRef.current && dailyGoalRef.current > 0 ? (
            <>
              <Text style={[styles.emptyIcon, { color: colors.subtitle }]}>🎯</Text>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                今日新词已学完
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.subtitle }]}>
                已完成 {todayCountRef.current} 个新词{reviewCompleted ? '，明天继续加油！' : '，来巩固一下吧！'}
              </Text>
              {!reviewCompleted && (
                <TouchableOpacity
                  style={[styles.reviewStartBtn, { backgroundColor: colors.tint }]}
                  onPress={startReview}
                >
                  <Text style={[styles.reviewStartText, { color: '#0D0D0D' }]}>
                    开始巩固测试
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[styles.extraBtn, { borderColor: colors.tint }]}
                onPress={confirmExtraPractice}
              >
                <Text style={[styles.extraBtnText, { color: colors.tint }]}>
                  继续学习新词（+10）
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={[styles.emptyIcon, { color: colors.subtitle }]}>🎉</Text>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                All caught up!
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.subtitle }]}>
                「{wordbook.name}」没有待复习的词了，明天再来看看～
              </Text>
            </>
          )}
        </ScrollView>
      ) : !reviewPhase && word ? (
        <View style={styles.cardArea}>
          {extraRemaining != null && extraRemaining > 0 && (
            <View style={styles.extraBadge}>
              <Text style={styles.extraBadgeText}>加练中 · 剩余 {extraRemaining} 词</Text>
            </View>
          )}
          {isReview && (
            <View style={styles.reviewBadge}>
              <Text style={styles.reviewBadgeText}>复习</Text>
            </View>
          )}
          <FlashCard
            key={cardKey}
            word={word}
            language={ENGLISH}
            onFlip={setIsFlipped}
          />
          {isFlipped ? (
            <View style={styles.gradeArea}>
              <Text style={[styles.masteryHint, { color: colors.subtitle }]}>
                {reps > 0 ? `已掌握进度 ${reps}/3` : '新词 · 选择掌握程度以记录学习'}
              </Text>
              <View style={styles.gradeRow}>
                {GRADES.map((g) => (
                  <TouchableOpacity
                    key={g.grade}
                    style={[styles.gradeButton, { backgroundColor: g.color }]}
                    onPress={() => handleGrade(g.grade)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.gradeText}>{g.label}</Text>
                    <Text style={styles.gradeCn}>{g.cn}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ) : (
            <Text style={[styles.hint, { color: colors.pinyin }]}>
              Tap the card to reveal
            </Text>
          )}
        </View>
      ) : null}
    </View>
  );
}

function StatChip({
  icon,
  value,
  label,
  color,
}: {
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  value: string;
  label: string;
  color: string;
}) {
  return (
    <View style={styles.chip}>
      <FontAwesome name={icon} size={14} color={color} />
      <Text style={[styles.chipValue, { color: '#E8E0D4' }]}>{value}</Text>
      <Text style={styles.chipLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
  },
  titleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  chip: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#1A1814',
    borderRadius: 12,
    paddingVertical: 10,
    marginHorizontal: 4,
  },
  chipValue: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 2,
  },
  chipLabel: {
    fontSize: 11,
    color: '#9C9486',
    marginTop: 1,
  },
  emptyScroll: {
    flex: 1,
  },
  emptyContainer: {
    flex: 1,
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 60,
    paddingHorizontal: 20,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 15,
    marginBottom: 28,
    textAlign: 'center',
  },
  cardArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 40,
  },
  gradeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    width: '100%',
  },
  gradeArea: {
    width: '100%',
  },
  masteryHint: {
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 8,
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
  gradeCn: {
    color: '#FFFFFF',
    fontSize: 12,
    marginTop: 2,
    opacity: 0.9,
  },
  hint: {
    marginTop: 22,
    fontSize: 13,
    letterSpacing: 0.3,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 8,
  },
  errorSub: {
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 24,
    paddingHorizontal: 24,
  },
  retryButton: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 40,
    alignItems: 'center',
  },
  retryText: {
    color: '#0D0D0D',
    fontSize: 17,
    fontWeight: '700',
  },
  // --- 复习测试流程 ---
  reviewArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 60,
  },
  reviewProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: 4,
    marginBottom: 24,
  },
  reviewProgressText: {
    fontSize: 13,
    fontWeight: '600',
  },
  reviewCard: {
    width: '100%',
    minHeight: 200,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  reviewCardBack: {
    alignItems: 'center',
  },
  reviewWord: {
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  reviewTrans: {
    fontSize: 18,
    marginTop: 16,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  reviewButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
    width: '100%',
  },
  reviewBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  reviewBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
  reviewStartBtn: {
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 40,
    alignItems: 'center',
  },
  reviewStartText: {
    fontSize: 17,
    fontWeight: '700',
  },
  reviewBadge: {
    alignSelf: 'center',
    backgroundColor: '#F5A623',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 8,
  },
  reviewBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  extraBtn: {
    marginTop: 12,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 40,
    alignItems: 'center',
    borderWidth: 1.5,
  },
  extraBtnText: {
    fontSize: 16,
    fontWeight: '600',
  },
  extraBadge: {
    alignSelf: 'center',
    backgroundColor: '#3B82F6',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 3,
    marginBottom: 8,
  },
  extraBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
});
