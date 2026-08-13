import React, { useMemo, useState } from 'react';
import { StyleSheet, View, Text, ActivityIndicator, TouchableOpacity, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import useColors from '@/components/useColors';
import { repo } from '@/lib/data';
import {
  buildStudentProgressSummary,
  buildWeakWordEntries,
  buildWrongLogEntries,
  buildAZWords,
  type StudentProgressSummary,
  type WeakWordEntry,
  type WrongLogEntry,
} from '@/lib/data/studentProgress';
import { StudentProgressOverview, WeakList, WrongList } from '@/components/StudentProgressParts';
import { useSession } from '@/components/SessionProvider';

// 与教师端学员详情一致的三 Tab 结构（需求 2026-08-14）
type Section = 'overview' | 'weak' | 'wrong';
const SECTIONS: { key: Section; label: string }[] = [
  { key: 'overview', label: '概览' },
  { key: 'weak', label: '薄弱词' },
  { key: 'wrong', label: '错题' },
];

/** 从打卡数据推导连续学习天数：从今天（或昨天）往前数连续有记录的日子 */
function computeStreak(checkin: StudentProgressSummary['checkin']): number {
  let streak = 0;
  let started = false;
  for (let i = checkin.length - 1; i >= 0; i--) {
    const c = checkin[i];
    if (c.count > 0) {
      streak += 1;
      started = true;
    } else if (!started && i === checkin.length - 1) {
      // 今天还没学不打断连击，从昨天继续数
      continue;
    } else {
      break;
    }
  }
  return streak;
}

export default function StatsScreen() {
  const [section, setSection] = useState<Section>('overview');
  const [summary, setSummary] = useState<StudentProgressSummary | null>(null);
  const [weakWords, setWeakWords] = useState<WeakWordEntry[]>([]);
  const [wrongLogs, setWrongLogs] = useState<WrongLogEntry[]>([]);
  const [azWords, setAzWords] = useState<{ id: string; word: string }[] | null>(null);
  const [loading, setLoading] = useState(true);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, wordbook, isAdmin, isTeacher } = useSession();
  const router = useRouter();
  const weakIds = useMemo(() => new Set(weakWords.map((w) => String(w.word_id))), [weakWords]);

  useFocusEffect(
    React.useCallback(() => {
      let cancelled = false;
      (async () => {
        if (!user || !wordbook) return;
        const now = Date.now();
        const [s, weak, wrong, az] = await Promise.all([
          buildStudentProgressSummary(repo, user.id, wordbook.id, now),
          buildWeakWordEntries(repo, user.id, wordbook.id, now),
          buildWrongLogEntries(repo, user.id, wordbook.id, now),
          buildAZWords(repo, wordbook.id),
        ]);
        if (cancelled) return;
        setSummary(s);
        setWeakWords(weak);
        setWrongLogs(wrong);
        setAzWords(az);
        setLoading(false);
      })();
      return () => {
        cancelled = true;
      };
    }, [user, wordbook]),
  );

  if (loading || !summary || !wordbook) {
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

  const streak = computeStreak(summary.checkin);

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      <Text style={[styles.heading, { color: colors.text }]}>
        {wordbook.name} · 统计
      </Text>

      {(isAdmin || isTeacher) && (
        <TouchableOpacity
          style={[styles.teacherBtn, { backgroundColor: colors.tint }]}
          onPress={() => router.push('/teacher/students')}
          activeOpacity={0.7}
        >
          <FontAwesome name="users" size={15} color="#0D0D0D" />
          <Text style={styles.teacherBtnText}>学员学习情况</Text>
        </TouchableOpacity>
      )}

      {/* Tab bar */}
      <View style={styles.tabRow}>
        {SECTIONS.map((s) => (
          <TouchableOpacity
            key={s.key}
            style={[styles.tab, { borderBottomColor: section === s.key ? colors.tint : 'transparent' }]}
            onPress={() => setSection(s.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, { color: section === s.key ? colors.tint : colors.subtitle }]}>
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {section === 'overview' ? (
        <ScrollView contentContainerStyle={{ gap: 12, paddingBottom: 40 }}>
          {/* 连续学习 */}
          <View style={[styles.streakCard, { backgroundColor: colors.card }]}>
            <FontAwesome name="fire" size={28} color={colors.tint} />
            <View>
              <Text style={[styles.streakNum, { color: colors.text }]}>{streak} 天</Text>
              <Text style={[styles.streakLabel, { color: colors.subtitle }]}>连续学习</Text>
            </View>
          </View>
          {/* 统一进度视图：词本完成度 + 打卡 + A-Z（与教师端学员详情同源组件） */}
          <StudentProgressOverview
            summary={summary}
            azWords={azWords}
            weakIds={weakIds}
            hasWordbook
          />
        </ScrollView>
      ) : section === 'weak' ? (
        <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 40 }}>
          <View style={[styles.summaryCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.summaryTitle, { color: colors.text }]}>薄弱单词 {weakWords.length} 个</Text>
            <Text style={[styles.summaryHint, { color: colors.subtitle }]}>
              错误率高 / 近期屡错 / 逾期超3天 / 学了7天仍未巩固
            </Text>
          </View>
          <WeakList words={weakWords} colors={colors} />
        </ScrollView>
      ) : (
        <ScrollView contentContainerStyle={{ gap: 10, paddingBottom: 40 }}>
          <View style={[styles.summaryCard, { backgroundColor: colors.card }]}>
            <Text style={[styles.summaryTitle, { color: colors.text }]}>错题 {wrongLogs.length} 词</Text>
            <Text style={[styles.summaryHint, { color: colors.subtitle }]}>
              学习/练习/复习中答错过（Again/Hard）的单词，按错误次数排序
            </Text>
          </View>
          <WrongList logs={wrongLogs} colors={colors} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20 },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
    paddingVertical: 16,
  },
  teacherBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 12,
  },
  teacherBtnText: { color: '#0D0D0D', fontSize: 15, fontWeight: '700' },
  tabRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#2A2520',
    marginBottom: 12,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    borderBottomWidth: 2,
    alignItems: 'center',
  },
  tabText: { fontSize: 14, fontWeight: '600' },
  streakCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 18,
    gap: 16,
  },
  streakNum: { fontSize: 26, fontWeight: '800' },
  streakLabel: { fontSize: 13, marginTop: 2 },
  summaryCard: { borderRadius: 14, padding: 14, marginBottom: 4 },
  summaryTitle: { fontSize: 15, fontWeight: '700' },
  summaryHint: { fontSize: 12, marginTop: 2 },
});
