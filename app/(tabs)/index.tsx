import React, { useState, useCallback, useRef } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  Text,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useColors from '@/components/useColors';
import { repo, postStudyLogs } from '@/lib/data';
import type { Word } from '@/lib/data';
import { getNextQuizWord, getTodayNewWordCount } from '@/lib/data/quiz';
import { getDailyNewWordGoal } from '@/lib/data/settings';
import { reviewWord } from '@/lib/data/review';
import { getWordbookStats, type WordbookStats } from '@/lib/data/stats';
import { Grade } from '@/lib/sm2';
import { getPriorityIds, clearPriorityIds } from '@/lib/quizSelection';
import { getLanguageByCode } from '@/lib/languages';
import { useSession } from '@/components/SessionProvider';
import FlashCard from '@/components/FlashCard';

const ENGLISH = getLanguageByCode('en');
const USE_CLOUD = process.env.EXPO_PUBLIC_USE_CLOUD === 'true';
const GRADES: { grade: Grade; label: string; color: string }[] = [
  { grade: 0, label: 'Again', color: '#E5484D' },
  { grade: 1, label: 'Hard', color: '#F5A623' },
  { grade: 2, label: 'Good', color: '#30A46C' },
  { grade: 3, label: 'Easy', color: '#3B82F6' },
];

export default function HomeScreen() {
  const [word, setWord] = useState<Word | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [stats, setStats] = useState<WordbookStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [cardKey, setCardKey] = useState(0);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, wordbook } = useSession();
  const activeWbRef = useRef<string | null>(null);
  const hasWordRef = useRef(false);

  const loadNext = useCallback(async () => {
    if (!user || !wordbook) return;
    const now = Date.now();
    // 每日新词上限：并行取全局目标值与今日已学新词数（getDailyNewWordGoal 走 AsyncStorage）
    const [goal, todayCount] = await Promise.all([
      getDailyNewWordGoal(user.id),
      getTodayNewWordCount(repo, user.id, wordbook.id, now),
    ]);
    const prio = getPriorityIds();
    const [w, s] = await Promise.all([
      getNextQuizWord(repo, user.id, wordbook.id, prio, now, goal, todayCount),
      getWordbookStats(repo, user.id, wordbook.id, now),
    ]);
    clearPriorityIds();
    setWord(w);
    hasWordRef.current = w != null;
    setStats(s);
    setIsFlipped(false);
    setCardKey((k) => k + 1);
    setLoading(false);
    // 云端模式：slim 词表不含释义大字段，选中单词后异步拉取
    // 完整数据（释义/词组/例句）合并到卡片，不阻塞显示
    if (USE_CLOUD && w) {
      const wid = w.id;
      (async () => {
        try {
          const { fetchWordDetail } = await import('@/lib/data/httpRepo');
          const full = await fetchWordDetail(wid);
          // 仅当还是同一张卡时才更新，避免旧响应覆盖新词
          setWord((cur) => (cur && cur.id === wid ? { ...cur, ...full } : cur));
        } catch { /* 释义加载失败不影响基本学习 */ }
      })();
    }
  }, [user, wordbook]);

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
      if (USE_CLOUD) {
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
      loadNext();
    }
  };

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

      {!word ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyIcon, { color: colors.subtitle }]}>🎉</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            All caught up!
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.subtitle }]}>
            「{wordbook.name}」没有待复习的词了，明天再来看看～
          </Text>
        </View>
      ) : (
        <View style={styles.cardArea}>
          <FlashCard
            key={cardKey}
            word={word}
            language={ENGLISH}
            onFlip={setIsFlipped}
          />
          {isFlipped ? (
            <View style={styles.gradeRow}>
              {GRADES.map((g) => (
                <TouchableOpacity
                  key={g.grade}
                  style={[styles.gradeButton, { backgroundColor: g.color }]}
                  onPress={() => handleGrade(g.grade)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.gradeText}>{g.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <Text style={[styles.hint, { color: colors.pinyin }]}>
              Tap the card to reveal
            </Text>
          )}
        </View>
      )}
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
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 60,
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
});
