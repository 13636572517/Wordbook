import React, { useCallback, useEffect, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import useColors from '@/components/useColors';
import { repo, httpRepo, postStudyLogs } from '@/lib/data';
import { fetchWordDetail } from '@/lib/data/httpRepo';
import type { Word, WordDefinition, WordPhrase, WordExample, UserWordProgress } from '@/lib/data';
import { startOfDayTs } from '@/lib/data/types';
import { getWeakWordIds } from '@/lib/data/weak';
import { getWordbookStats, type WordbookStats } from '@/lib/data/stats';
import { getDailySettings, DEFAULT_DAILY_SETTINGS, type DailySettings } from '@/lib/data/settings';
import { reviewWord } from '@/lib/data/review';
import { getTodayCounts, type TodayCounts } from '@/lib/todayCounts';
import { buildAdvice, type AdviceItem } from '@/lib/progressAdvice';
import { speakWord } from '@/lib/speech';
import { getLanguageByCode } from '@/lib/languages';
import type { Grade } from '@/lib/sm2';
import FlashCard from '@/components/FlashCard';
import QuizRunner from '@/components/QuizRunner';
import { useSession } from '@/components/SessionProvider';

const isCloud = repo === httpRepo;
const ENGLISH = getLanguageByCode('en');
const DAY = 24 * 60 * 60 * 1000;

type PQuizType = 'dictation' | 'choice' | 'sentence-choice';
const QUIZ_TYPES: PQuizType[] = ['dictation', 'choice', 'sentence-choice'];
const REVIEW_GRADES: { grade: Grade; label: string; cn: string; color: string }[] = [
  { grade: 0, label: 'Again', cn: '不会', color: '#E5484D' },
  { grade: 1, label: 'Hard', cn: '模糊', color: '#F5A623' },
  { grade: 2, label: 'Good', cn: '认识', color: '#30A46C' },
  { grade: 3, label: 'Easy', cn: '很熟', color: '#3B82F6' },
];

type Training = null | 'review' | 'quiz';

export default function ProgressScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, wordbook } = useSession();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<WordbookStats | null>(null);
  const [weakWords, setWeakWords] = useState<Word[]>([]);
  const [weakProg, setWeakProg] = useState<Map<string, UserWordProgress>>(new Map());
  const [today, setToday] = useState<TodayCounts>({ newWords: 0, reviewWords: 0, quizCount: 0 });
  const [settings, setSettings] = useState<DailySettings>(DEFAULT_DAILY_SETTINGS);
  const [advice, setAdvice] = useState<AdviceItem[]>([]);
  const [training, setTraining] = useState<Training>(null);
  const [reviewIdx, setReviewIdx] = useState(0);
  const [reviewDone, setReviewDone] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailMap, setDetailMap] = useState<Map<string, Word>>(new Map());
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user || !wordbook) return;
    const now = Date.now();
    try {
      const [s, weakIds, tc, ds, words] = await Promise.all([
        getWordbookStats(repo, user.id, wordbook.id, now),
        getWeakWordIds(repo, user.id, wordbook.id, now),
        getTodayCounts(repo, user.id, wordbook.id, now),
        getDailySettings(user.id),
        repo.getWordsByWordbook(wordbook.id),
      ]);
      const weakSet = new Set(weakIds);
      const weakList = words.filter((w) => weakSet.has(w.id));

      // 遍历进度（httpRepo 有批量缓存，仅一次请求）：
      // 收集薄弱词明细 + 未来3天到期曲线
      const tomorrow0 = startOfDayTs(now) + DAY;
      const buckets = [0, 0, 0];
      const progMap = new Map<string, UserWordProgress>();
      for (const w of words) {
        const p = await repo.getProgress(user.id, wordbook.id, w.id);
        if (!p) continue;
        if (weakSet.has(w.id)) progMap.set(w.id, p);
        if (p.due > now) {
          for (let i = 0; i < 3; i++) {
            if (p.due >= tomorrow0 + i * DAY && p.due < tomorrow0 + (i + 1) * DAY) {
              buckets[i]++;
              break;
            }
          }
        }
      }

      // 近7天日均新词速度
      const logs7 = await repo.listStudyLogs(user.id, wordbook.id, {
        sinceTs: startOfDayTs(now) - 6 * DAY,
        isNew: true,
      });
      const byDay = new Map<string, Set<string>>();
      for (const l of logs7) {
        if (l.ts > now) continue;
        const d = new Date(l.ts);
        const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        if (!byDay.has(key)) byDay.set(key, new Set());
        byDay.get(key)!.add(l.wordId);
      }
      let totalNew7 = 0;
      byDay.forEach((set) => { totalNew7 += set.size; });
      const avgDailyNew7d = totalNew7 / 7;

      setStats(s);
      setWeakWords(weakList);
      setWeakProg(progMap);
      setToday(tc);
      setSettings(ds);
      setAdvice(buildAdvice({
        dueNow: s.due,
        weakCount: weakList.length,
        remainingNew: s.newCount,
        targetFinishDate: ds.targetFinishDate,
        avgDailyNew7d,
        dueNext3Days: buckets,
        now,
      }));
    } finally {
      setLoading(false);
    }
  }, [user, wordbook]);

  useFocusEffect(useCallback(() => {
    if (training == null) load();
  }, [load, training]));

  // ===== 专项复习（闪卡循环） =====
  const startReviewTraining = () => {
    if (weakWords.length === 0) return;
    setReviewIdx(0);
    setReviewDone(false);
    setTraining('review');
  };

  const reviewCurrent = weakWords[reviewIdx];
  useEffect(() => {
    if (training === 'review' && reviewCurrent && !reviewDone) {
      speakWord(reviewCurrent.word, ENGLISH);
    }
  }, [training, reviewIdx, reviewDone]);

  const handleReviewGrade = async (grade: Grade) => {
    if (!user || !wordbook || !reviewCurrent) return;
    const now = Date.now();
    await reviewWord(repo, user.id, wordbook.id, reviewCurrent.id, grade, now);
    if (isCloud) {
      await postStudyLogs([{ wordbookId: wordbook.id, wordId: reviewCurrent.id, grade, ts: now, source: 'review' }]);
    } else {
      await repo.addStudyLog({ userId: user.id, wordbookId: wordbook.id, wordId: reviewCurrent.id, grade, ts: now, source: 'review' });
    }
    if (reviewIdx + 1 >= weakWords.length) setReviewDone(true);
    else setReviewIdx((i) => i + 1);
  };

  const exitTraining = () => {
    setTraining(null);
    setExpandedId(null);
    load();
  };

  const handleWordPress = async (w: Word) => {
    if (expandedId === w.id) { setExpandedId(null); return; }
    setExpandedId(w.id);
    if (detailMap.has(w.id)) return;
    setLoadingDetail(w.id);
    try {
      // 云端 getWord 只返回基础字段，需 fetchWordDetail 拿释义/词组/例句
      const full = isCloud ? await fetchWordDetail(w.id) : await repo.getWord(w.id);
      if (full) {
        setDetailMap((prev) => new Map(prev).set(w.id, full));
        setWeakWords((prev) => prev.map((x) => (x.id === w.id ? { ...x, ...full } : x)));
      }
    } catch { /* ignore */ }
    setLoadingDetail(null);
  };


  // ===== 训练覆盖层：专项练习 =====
  if (training === 'quiz') {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <Text style={[styles.title, { color: colors.text }]}>薄弱词专项练习</Text>
        <QuizRunner
          range="custom"
          opts={{ wordIds: weakWords.map((w) => w.id) }}
          types={QUIZ_TYPES}
          limit={Math.max(5, Math.min(weakWords.length, settings.dailyQuizGoal))}
          onExit={exitTraining}
        />
      </View>
    );
  }

  // ===== 训练覆盖层：专项复习 =====
  if (training === 'review') {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={styles.trainHeader}>
          <TouchableOpacity onPress={exitTraining} style={styles.trainExit}>
            <FontAwesome name="close" size={18} color={colors.subtitle} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]}>
            专项复习 {reviewDone ? '完成' : `${reviewIdx + 1}/${weakWords.length}`}
          </Text>
          <View style={{ width: 30 }} />
        </View>
        {reviewDone ? (
          <View style={styles.trainDoneWrap}>
            <Text style={styles.trainDoneIcon}>🎉</Text>
            <Text style={[styles.trainDoneTitle, { color: colors.text }]}>本轮复习完成</Text>
            <Text style={[styles.trainDoneSub, { color: colors.subtitle }]}>
              共复习 {weakWords.length} 个薄弱词
            </Text>
            <TouchableOpacity style={[styles.trainDoneBtn, { backgroundColor: colors.tint }]} onPress={exitTraining}>
              <Text style={styles.trainDoneBtnText}>返回进度</Text>
            </TouchableOpacity>
          </View>
        ) : reviewCurrent ? (
          <View style={styles.trainBody}>
            <FlashCard key={reviewCurrent.id} word={reviewCurrent} language={ENGLISH} />
            <View style={styles.gradeRow}>
              {REVIEW_GRADES.map((g) => (
                <TouchableOpacity
                  key={g.grade}
                  style={[styles.gradeButton, { backgroundColor: g.color }]}
                  onPress={() => handleReviewGrade(g.grade)}
                >
                  <Text style={styles.gradeLabel}>{g.label}</Text>
                  <Text style={styles.gradeCn}>{g.cn}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    );
  }

  // ===== 主界面：三卡片 =====
  if (loading && !stats) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <Text style={[styles.title, { color: colors.text }]}>进度</Text>
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.tint} />
      </View>
    );
  }

  const learned = stats ? stats.total - stats.newCount : 0;
  const pct = stats && stats.total > 0 ? Math.round((learned / stats.total) * 100) : 0;

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <Text style={[styles.title, { color: colors.text }]}>进度</Text>
      <ScrollView contentContainerStyle={styles.scroll}>

        {/* ===== 卡片① 总体进度 ===== */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.cardHead}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>总体进度</Text>
            {stats && stats.streak > 0 && (
              <Text style={[styles.streakBadge, { color: colors.tint }]}>🔥 连续 {stats.streak} 天</Text>
            )}
          </View>
          <Text style={[styles.wbName, { color: colors.subtitle }]}>{wordbook?.name}</Text>
          <View style={[styles.barTrack, { backgroundColor: colors.background }]}>
            <View style={[styles.barFill, { backgroundColor: colors.tint, width: `${pct}%` }]} />
          </View>
          <Text style={[styles.barLabel, { color: colors.subtitle }]}>
            已学 {learned}/{stats?.total ?? 0}（{pct}%）
          </Text>
          <View style={styles.statRow}>
            <View style={styles.statCell}>
              <Text style={[styles.statNum, { color: colors.text }]}>{stats?.mastered ?? 0}</Text>
              <Text style={[styles.statLabel, { color: colors.subtitle }]}>已掌握</Text>
            </View>
            <View style={styles.statCell}>
              <Text style={[styles.statNum, { color: colors.text }]}>{stats?.learning ?? 0}</Text>
              <Text style={[styles.statLabel, { color: colors.subtitle }]}>学习中</Text>
            </View>
            <View style={styles.statCell}>
              <Text style={[styles.statNum, { color: stats && stats.due > 0 ? '#E5484D' : colors.text }]}>{stats?.due ?? 0}</Text>
              <Text style={[styles.statLabel, { color: colors.subtitle }]}>待复习</Text>
            </View>
          </View>
          <View style={[styles.todayBox, { backgroundColor: colors.background }]}>
            <Text style={[styles.todayItem, { color: colors.text }]}>
              今日新词 <Text style={{ color: colors.tint, fontWeight: '700' }}>{today.newWords}</Text>/{settings.dailyNewWordGoal}
            </Text>
            <Text style={[styles.todayItem, { color: colors.text }]}>
              复习 <Text style={{ color: colors.tint, fontWeight: '700' }}>{today.reviewWords}</Text> 词
            </Text>
            <Text style={[styles.todayItem, { color: colors.text }]}>
              练习 <Text style={{ color: colors.tint, fontWeight: '700' }}>{today.quizCount}</Text>/{settings.dailyQuizGoal} 题
            </Text>
          </View>
        </View>

        {/* ===== 卡片② 需加强的词 ===== */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <View style={styles.cardHead}>
            <Text style={[styles.cardTitle, { color: colors.text }]}>需加强的词</Text>
            <Text style={[styles.countBadge, { color: colors.subtitle }]}>{weakWords.length} 个</Text>
          </View>
          {weakWords.length === 0 ? (
            <Text style={[styles.weakEmpty, { color: colors.subtitle }]}>💪 暂无薄弱词，继续保持！</Text>
          ) : (
            <>
              <View style={styles.trainBtnRow}>
                <TouchableOpacity style={[styles.trainBtn, { backgroundColor: colors.tint }]} onPress={startReviewTraining}>
                  <FontAwesome name="refresh" size={13} color="#0D0D0D" />
                  <Text style={styles.trainBtnText}>专项复习</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.trainBtn, { backgroundColor: colors.tint }]} onPress={() => setTraining('quiz')}>
                  <FontAwesome name="pencil" size={13} color="#0D0D0D" />
                  <Text style={styles.trainBtnText}>专项练习</Text>
                </TouchableOpacity>
              </View>
              {weakWords.map((w) => {
                const p = weakProg.get(w.id);
                const reviewed = p ? p.correct + p.wrong : 0;
                const wrongPct = p && reviewed > 0 ? Math.round((p.wrong / reviewed) * 100) : 0;
                return (
                  <React.Fragment key={w.id}>
                    <TouchableOpacity style={[styles.weakItem, { backgroundColor: colors.background }]} onPress={() => handleWordPress(w)}>
                      <View style={styles.weakMain}>
                        <Text style={[styles.weakWord, { color: colors.text }]}>{w.word}</Text>
                        <Text style={[styles.weakTrans, { color: colors.subtitle }]} numberOfLines={1}>{w.translation}</Text>
                      </View>
                      <View style={styles.weakRight}>
                        {p && p.wrong > 0 && (
                          <Text style={styles.weakTag}>错 {p.wrong} 次{wrongPct >= 20 ? ` · ${wrongPct}%` : ''}</Text>
                        )}
                        <FontAwesome name={expandedId === w.id ? 'chevron-down' : 'chevron-right'} size={13} color={colors.subtitle} />
                      </View>
                    </TouchableOpacity>
                    {expandedId === w.id && (
                      <View style={[styles.detailCard, { backgroundColor: colors.background, borderColor: colors.border }]}>
                        {loadingDetail === w.id ? (
                          <ActivityIndicator size="small" color={colors.tint} style={{ marginVertical: 12 }} />
                        ) : (
                          <>
                            {w.definitions && w.definitions.length > 0 && (
                              <View style={styles.detailSection}>
                                <Text style={[styles.detailLabel, { color: colors.tint }]}>释义</Text>
                                {w.definitions.map((d: WordDefinition, i: number) => (
                                  <Text key={i} style={[styles.detailText, { color: colors.text }]}>
                                    <Text style={{ fontWeight: '600' }}>{d.pos.toLowerCase()}. </Text>{d.definition}
                                  </Text>
                                ))}
                              </View>
                            )}
                            {w.phrases && w.phrases.length > 0 && (
                              <View style={styles.detailSection}>
                                <Text style={[styles.detailLabel, { color: colors.tint }]}>词组</Text>
                                {w.phrases.map((ph: WordPhrase, i: number) => (
                                  <Text key={i} style={[styles.detailText, { color: colors.text }]}>
                                    {ph.phrase}{ph.meaning ? `  ${ph.meaning}` : ''}
                                  </Text>
                                ))}
                              </View>
                            )}
                            {w.examples && w.examples.length > 0 && (
                              <View style={styles.detailSection}>
                                <Text style={[styles.detailLabel, { color: colors.tint }]}>例句</Text>
                                {w.examples.map((e: WordExample, i: number) => (
                                  <View key={i} style={{ marginBottom: 4 }}>
                                    <Text style={[styles.detailText, { color: colors.text }]}>{e.en}</Text>
                                    {e.zh && <Text style={[styles.detailText, { color: colors.subtitle, fontSize: 13 }]}>{e.zh}</Text>}
                                  </View>
                                ))}
                              </View>
                            )}
                          </>
                        )}
                      </View>
                    )}
                  </React.Fragment>
                );
              })}
            </>
          )}
        </View>

        {/* ===== 卡片③ 建议 ===== */}
        <View style={[styles.card, { backgroundColor: colors.card }]}>
          <Text style={[styles.cardTitle, { color: colors.text }]}>建议</Text>
          {advice.map((a, i) => (
            <View key={i} style={[styles.adviceItem, { backgroundColor: colors.background }]}>
              <Text style={styles.adviceIcon}>
                {a.kind === 'due' ? '⏰' : a.kind === 'weak' ? '🎯' : a.kind === 'plan' ? '📅' : a.kind === 'peak' ? '⚠️' : '✅'}
              </Text>
              <Text style={[styles.adviceText, { color: colors.text }]}>{a.text}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  title: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12 },
  scroll: { paddingHorizontal: 20, paddingBottom: 30 },
  card: { borderRadius: 14, padding: 16, marginBottom: 14 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  cardTitle: { fontSize: 17, fontWeight: '700' },
  streakBadge: { fontSize: 13, fontWeight: '600' },
  countBadge: { fontSize: 13 },
  wbName: { fontSize: 13, marginBottom: 8 },
  barTrack: { height: 10, borderRadius: 5, overflow: 'hidden' },
  barFill: { height: 10, borderRadius: 5 },
  barLabel: { fontSize: 12, marginTop: 6 },
  statRow: { flexDirection: 'row', marginTop: 14 },
  statCell: { flex: 1, alignItems: 'center' },
  statNum: { fontSize: 22, fontWeight: '700' },
  statLabel: { fontSize: 12, marginTop: 2 },
  todayBox: { flexDirection: 'row', justifyContent: 'space-between', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginTop: 14 },
  todayItem: { fontSize: 13 },
  weakEmpty: { fontSize: 14, paddingVertical: 8 },
  trainBtnRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  trainBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  trainBtnText: { color: '#0D0D0D', fontSize: 14, fontWeight: '700' },
  weakItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  weakMain: { flex: 1, marginRight: 8 },
  weakWord: { fontSize: 16, fontWeight: '700' },
  weakTrans: { fontSize: 12, marginTop: 1 },
  weakRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  weakTag: { fontSize: 11, color: '#E5484D', fontWeight: '600' },
  detailCard: { marginTop: -6, marginBottom: 8, marginHorizontal: 4, borderRadius: 10, borderWidth: 1, padding: 12 },
  detailSection: { marginBottom: 10 },
  detailLabel: { fontSize: 12, fontWeight: '700', marginBottom: 3 },
  detailText: { fontSize: 13, lineHeight: 19, marginBottom: 2 },
  adviceItem: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, marginBottom: 8 },
  adviceIcon: { fontSize: 15 },
  adviceText: { flex: 1, fontSize: 13, lineHeight: 19 },
  // 训练覆盖层
  trainHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 8 },
  trainExit: { width: 30, alignItems: 'flex-start' },
  trainBody: { flex: 1, paddingHorizontal: 20 },
  gradeRow: { flexDirection: 'row', gap: 8, marginTop: 18 },
  gradeButton: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 10 },
  gradeLabel: { color: '#fff', fontWeight: '700', fontSize: 13 },
  gradeCn: { color: '#ffffffcc', fontSize: 11, marginTop: 1 },
  trainDoneWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  trainDoneIcon: { fontSize: 52 },
  trainDoneTitle: { fontSize: 20, fontWeight: '700' },
  trainDoneSub: { fontSize: 14 },
  trainDoneBtn: { marginTop: 14, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 22 },
  trainDoneBtnText: { color: '#0D0D0D', fontWeight: '700', fontSize: 15 },
});
