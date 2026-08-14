import { repo } from '@/lib/data';
import { getStudiedWords } from '@/lib/data/review-scope';
import { getWeakWordIds } from '@/lib/data/weak';
import { getDailySettings, setDailySettings } from '@/lib/data/settings';
import { selectSmartPracticeWordIds } from '@/lib/smartPick';
import { normalizePracticeGoal } from '@/lib/practiceSettings';
import { startOfDayTs } from '@/lib/data/types';
import { type RangeKind } from '@/lib/quizgen';
import { useSession } from '@/components/SessionProvider';
import useColors from '@/components/useColors';
import QuizRunner from '@/components/QuizRunner';
import Layout from '@/constants/Layout';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

type QuizType = 'dictation' | 'choice' | 'phrase' | 'phrase-blank' | 'sentence-choice';
type QuizRange = 'smart' | 'studied' | 'weak' | 'recent';
type Mode = 'menu' | 'quiz';

const PRACTICE_GOALS = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
const RANGES: { key: QuizRange; label: string }[] = [
  { key: 'smart', label: '智能选择' },
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

function rangeParams(range: Exclude<QuizRange, 'smart'>): { range: RangeKind; opts?: { days?: number } } {
  if (range === 'weak') return { range: 'weak' };
  if (range === 'recent') return { range: 'recent', opts: { days: 7 } };
  return { range: 'studied' };
}

export default function PracticeScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, wordbook } = useSession();
  const [mode, setMode] = useState<Mode>('menu');
  const [quizRange, setQuizRange] = useState<QuizRange>('smart');
  const [practiceGoal, setPracticeGoal] = useState(20);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [goalMenuOpen, setGoalMenuOpen] = useState(false);
  const [startingType, setStartingType] = useState<QuizType | null>(null);
  const [activeType, setActiveType] = useState<QuizType>('dictation');
  const [activeRange, setActiveRange] = useState<RangeKind>('studied');
  const [activeOpts, setActiveOpts] = useState<{ days?: number; wordIds?: string[] }>();

  useEffect(() => {
    if (!user) {
      setSettingsLoading(false);
      return;
    }
    let active = true;
    setSettingsLoading(true);
    getDailySettings(user.id).then((settings) => {
      if (active) setPracticeGoal(normalizePracticeGoal(settings.dailyQuizGoal));
    }).catch(() => {}).finally(() => {
      if (active) setSettingsLoading(false);
    });
    return () => { active = false; };
  }, [user]);

  const buildSmartWordIds = async (): Promise<string[]> => {
    if (!user || !wordbook) return [];
    const now = Date.now();
    const [words, logs, weakWordIds] = await Promise.all([
      getStudiedWords(repo, user.id, wordbook.id),
      repo.listStudyLogs(user.id, wordbook.id, { sinceTs: startOfDayTs(now) }),
      getWeakWordIds(repo, user.id, wordbook.id, now),
    ]);
    const dueWordIds = (await Promise.all(words.map(async (word) => {
      const progress = await repo.getProgress(user.id, wordbook.id, word.id);
      return progress && progress.due <= now ? word.id : null;
    }))).filter((id): id is string => id != null);
    return selectSmartPracticeWordIds({
      words,
      todayNewWordIds: logs.filter((log) => log.source === 'study' && log.isNew).map((log) => log.wordId),
      todayQuizWordIds: logs.filter((log) => log.source === 'quiz' || log.source === 'review').map((log) => log.wordId),
      dueWordIds,
      weakWordIds,
      goal: practiceGoal,
    });
  };

  const startQuiz = async (type: QuizType) => {
    setStartingType(type);
    try {
      setActiveType(type);
      if (quizRange === 'smart') {
        setActiveRange('custom');
        setActiveOpts({ wordIds: await buildSmartWordIds() });
      } else {
        const next = rangeParams(quizRange);
        setActiveRange(next.range);
        setActiveOpts(next.opts);
      }
      setMode('quiz');
    } finally {
      setStartingType(null);
    }
  };

  const updatePracticeGoal = async (goal: number) => {
    setPracticeGoal(goal);
    setGoalMenuOpen(false);
    if (user) await setDailySettings(user.id, { dailyQuizGoal: goal });
  };

  const title = <Text style={[styles.title, { color: colors.text }]}>练习</Text>;

  if (mode === 'quiz') {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={styles.contentCol}>
          {title}
          <QuizRunner
            range={activeRange}
            opts={activeOpts}
            types={[activeType]}
            limit={practiceGoal}
            onExit={() => setMode('menu')}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* 下拉菜单打开时的透明遮罩：点击外部关闭 */}
      {goalMenuOpen && (
        <TouchableOpacity
          style={styles.menuOverlay}
          activeOpacity={1}
          onPress={() => setGoalMenuOpen(false)}
        />
      )}
      <View style={styles.contentCol}>
        {title}
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
        <Text style={[styles.scopeHint, { color: colors.pinyin }]}>练习「{wordbook?.name ?? '当前词本'}」中已学过的单词</Text>
        <View style={styles.settingRow}>
          <View>
            <Text style={[styles.settingLabel, { color: colors.text }]}>本次练习数量</Text>
            <Text style={[styles.settingHint, { color: colors.subtitle }]}>所有题型均按此数量选词</Text>
          </View>
          <View>
            <TouchableOpacity
              accessibilityRole="button"
              style={[styles.goalSelect, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={() => setGoalMenuOpen((open) => !open)}
            >
              <Text style={[styles.goalSelectText, { color: colors.text }]}>{practiceGoal} 词</Text>
              <FontAwesome name="chevron-down" size={13} color={colors.subtitle} />
            </TouchableOpacity>
            {goalMenuOpen && (
              <View style={[styles.goalMenu, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {PRACTICE_GOALS.map((goal) => (
                  <TouchableOpacity key={goal} style={styles.goalOption} onPress={() => updatePracticeGoal(goal)}>
                    <Text style={[styles.goalOptionText, { color: goal === practiceGoal ? colors.tint : colors.text }]}>{goal} 词</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        </View>

        <Text style={[styles.sectionTitle, { color: colors.subtitle }]}>选词范围</Text>
        <View style={styles.chipRow}>
          {RANGES.map((range) => (
            <TouchableOpacity
              key={range.key}
              style={[styles.chip, { backgroundColor: quizRange === range.key ? colors.tint : colors.card, borderColor: colors.border }]}
              onPress={() => setQuizRange(range.key)}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipText, { color: quizRange === range.key ? '#0D0D0D' : colors.text }]}>{range.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        {quizRange === 'smart' && (
          <Text style={[styles.smartHint, { color: colors.pinyin }]}>优先今日新学未练习，再选到期词、薄弱词，最后补足其他已学词。</Text>
        )}

        <Text style={[styles.sectionTitle, { color: colors.subtitle, marginTop: 22 }]}>选择题型</Text>
        <View style={styles.typeGrid}>
          {TYPES.map((type, i) => {
            // 题型数为奇数时，最后一张卡通栏，避免布局不对称
            const full = TYPES.length % 2 === 1 && i === TYPES.length - 1;
            return (
              <TouchableOpacity
                key={type.key}
                style={[
                  styles.typeCard,
                  { backgroundColor: colors.card, opacity: startingType && startingType !== type.key ? 0.55 : 1 },
                  full && { width: '100%' },
                ]}
                onPress={() => startQuiz(type.key)}
                disabled={startingType != null || settingsLoading}
                activeOpacity={0.7}
              >
                <View style={[styles.typeIconWrap, { backgroundColor: colors.tint + '22' }]}>
                  {startingType === type.key || settingsLoading ? <ActivityIndicator size="small" color={colors.tint} /> : <FontAwesome name={type.icon} size={20} color={colors.tint} />}
                </View>
                <Text style={[styles.typeLabel, { color: colors.text }]}>{type.label}</Text>
                <Text style={[styles.typeDesc, { color: colors.subtitle }]} numberOfLines={1}>{type.desc}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  // 桌面宽屏下内容居中限宽
  contentCol: {
    flex: 1,
    width: '100%',
    maxWidth: Layout.maxContentWidth,
    alignSelf: 'center',
  },
  // 下拉菜单遮罩：覆盖全屏，点击关闭菜单
  menuOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
  },
  title: { fontSize: 28, fontWeight: '700', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 40 },
  scopeHint: { fontSize: 12.5, lineHeight: 18, marginBottom: 16 },
  settingRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 22 },
  settingLabel: { fontSize: 16, fontWeight: '700' },
  settingHint: { fontSize: 12, marginTop: 4 },
  goalSelect: { minWidth: 94, height: 40, borderWidth: 1, borderRadius: 6, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  goalSelectText: { fontSize: 14, fontWeight: '700' },
  goalMenu: {
    position: 'absolute', zIndex: 10, right: 0, top: 44, width: 94,
    borderWidth: 1, borderRadius: 6, overflow: 'hidden',
    // 悬浮感：阴影区分于下方内容
    elevation: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  goalOption: { paddingHorizontal: 12, paddingVertical: 10 },
  goalOptionText: { fontSize: 14, fontWeight: '600' },
  sectionTitle: { fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: { borderRadius: 6, borderWidth: 1, paddingVertical: 10, paddingHorizontal: 14 },
  chipText: { fontSize: 14, fontWeight: '600' },
  smartHint: { fontSize: 12.5, lineHeight: 18, marginTop: 12 },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  typeCard: { width: '47%', borderRadius: 6, padding: 16, alignItems: 'center', gap: 6 },
  typeIconWrap: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  typeLabel: { fontSize: 15, fontWeight: '700' },
  typeDesc: { fontSize: 12 },
});
