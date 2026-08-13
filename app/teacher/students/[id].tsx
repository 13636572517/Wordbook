import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ActivityIndicator,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import useColors from '@/components/useColors';
import { useSession } from '@/components/SessionProvider';
import {
  fetchStudentProgress,
  fetchStudentWeakWords,
  fetchStudentWrongLogs,
  fetchStudents,
  type StudentInfo,
  type StudentProgressSummary,
  type TeacherWeakWord,
  type TeacherWrongLog,
} from '@/lib/data/httpRepo';
import { repo, type Wordbook } from '@/lib/data';
import { StudentProgressOverview, WeakList } from '@/components/StudentProgressParts';

const USE_CLOUD = process.env.EXPO_PUBLIC_USE_CLOUD === 'true';

// 概览 = 原概览卡 + 打卡 + A-Z 合并（需求 2026-08-13）
type Section = 'overview' | 'weak' | 'wrong';
const SECTIONS: { key: Section; label: string }[] = [
  { key: 'overview', label: '概览' },
  { key: 'weak', label: '薄弱词' },
  { key: 'wrong', label: '错题' },
];

export default function TeacherStudentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = parseInt(id || '0', 10);

  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [wordbooks, setWordbooks] = useState<Wordbook[]>([]);
  const [selectedWb, setSelectedWb] = useState<number | null>(null);
  const [section, setSection] = useState<Section>('overview');

  const [summary, setSummary] = useState<StudentProgressSummary | null>(null);
  const [summaryKey, setSummaryKey] = useState('');
  const [weakWords, setWeakWords] = useState<TeacherWeakWord[]>([]);
  const [weakKey, setWeakKey] = useState('');
  const [wrongLogs, setWrongLogs] = useState<TeacherWrongLog[]>([]);
  const [wrongTotal, setWrongTotal] = useState(0);
  const [wrongKey, setWrongKey] = useState('');
  const [azWords, setAzWords] = useState<{ id: string; word: string }[] | null>(null);
  const [azKey, setAzKey] = useState('');

  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);

  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isAdmin, isTeacher } = useSession();
  const weakIds = useMemo(() => new Set(weakWords.map((w) => String(w.word_id))), [weakWords]);

  // Load student info + wordbooks
  useEffect(() => {
    if (!USE_CLOUD || !userId) return;
    (async () => {
      try {
        const [students, wbs] = await Promise.all([
          fetchStudents(),
          repo.listWordbooks(),
        ]);
        const s = students.find((x: StudentInfo) => x.user_id === userId);
        setStudent(s || null);
        const sysWbs = wbs.filter((w: Wordbook) => w.type === 'system');
        setWordbooks(sysWbs);
        // 缺省选中该学员最后学习的词本（而非「全部词本」）
        if (s?.last_wordbook_id != null && sysWbs.some((w) => parseInt(w.id) === s.last_wordbook_id)) {
          setSelectedWb(s.last_wordbook_id);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  // Load section data（按词本 key 缓存，切换 Tab/词本时按需拉取）
  const loadSection = useCallback(
    async (s: Section, wbId: number | null) => {
      if (!userId) return;
      setDataLoading(true);
      const key = String(wbId ?? 'all');
      try {
        if (s === 'overview' && summaryKey !== key) {
          const d = await fetchStudentProgress(userId, wbId ?? undefined);
          setSummary(d);
          setSummaryKey(key);
        }
        if ((s === 'weak' || s === 'overview') && weakKey !== key) {
          const w = await fetchStudentWeakWords(userId, wbId ?? undefined);
          setWeakWords(w);
          setWeakKey(key);
        }
        if (s === 'wrong' && wrongKey !== key) {
          const wl = await fetchStudentWrongLogs(userId, wbId ?? undefined);
          setWrongLogs(wl.items);
          setWrongTotal(wl.total);
          setWrongKey(key);
        }
        // A-Z 需要词本全量词表（算每字母总数）；仅具体词本时拉取
        if (s === 'overview' && wbId != null && azKey !== key) {
          const words = await repo.getWordsByWordbook(String(wbId));
          setAzWords(words.map((w) => ({ id: w.id, word: w.word })));
          setAzKey(key);
        }
      } catch {
        // ignore
      } finally {
        setDataLoading(false);
      }
    },
    [userId, summaryKey, weakKey, wrongKey, azKey],
  );

  useEffect(() => {
    loadSection(section, selectedWb);
  }, [section, selectedWb, loadSection]);

  if (!isAdmin && !isTeacher) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <Text style={[styles.errorText, { color: colors.subtitle }]}>仅教师/管理员可查看</Text>
      </View>
    );
  }

  if (loading || !student) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color={colors.tint} style={{ marginTop: 60 }} />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.backBtn}>
          <FontAwesome name="arrow-left" size={16} color={colors.tint} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>{student.nickname}</Text>
      </View>

      {/* Student stats bar */}
      <View style={[styles.statsBar, { backgroundColor: colors.card }]}>
        <MiniStat label="已学词" value={student.word_count} color="#E8E0D4" />
        <MiniStat label="学习天数" value={student.studied_days} color="#F5A623" />
        <MiniStat label="近7天活跃" value={student.recent_days} color="#30A46C" />
      </View>

      {/* Wordbook selector */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.wbScroll}>
        <TouchableOpacity
          style={[styles.wbChip, { backgroundColor: selectedWb === null ? colors.tint : colors.card }]}
          onPress={() => setSelectedWb(null)}
          activeOpacity={0.7}
        >
          <Text style={[styles.wbChipText, { color: selectedWb === null ? '#0D0D0D' : colors.text }]}>全部词本</Text>
        </TouchableOpacity>
        {wordbooks.map((wb) => (
          <TouchableOpacity
            key={wb.id}
            style={[styles.wbChip, { backgroundColor: selectedWb === parseInt(wb.id) ? colors.tint : colors.card }]}
            onPress={() => setSelectedWb(parseInt(wb.id))}
            activeOpacity={0.7}
          >
            <Text style={[styles.wbChipText, { color: selectedWb === parseInt(wb.id) ? '#0D0D0D' : colors.text }]}>
              {wb.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Tab bar */}
      <View style={styles.tabRow}>
        {SECTIONS.map((s) => (
          <TouchableOpacity
            key={s.key}
            style={[styles.tab, { borderBottomColor: section === s.key ? colors.tint : 'transparent' }]}
            onPress={() => setSection(s.key)}
            activeOpacity={0.7}
          >
            <Text style={[styles.tabText, { color: section === s.key ? colors.tint : colors.subtitle }]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {dataLoading ? (
        <ActivityIndicator size="large" color={colors.tint} style={{ marginTop: 40 }} />
      ) : section === 'overview' && summary ? (
        <ScrollView contentContainerStyle={{ paddingBottom: 20 }}>
          <StudentProgressOverview
            summary={summary}
            azWords={azWords}
            weakIds={weakIds}
            hasWordbook={selectedWb != null}
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
        <WrongSection logs={wrongLogs} total={wrongTotal} colors={colors} />
      )}
    </View>
  );
}

/* ── Sub-sections ──────────────────────────────────────────────────────── */

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={sectionStyles.miniStat}>
      <Text style={[sectionStyles.miniNum, { color }]}>{value}</Text>
      <Text style={sectionStyles.miniLabel}>{label}</Text>
    </View>
  );
}

function WrongSection({
  logs,
  total,
  colors,
}: {
  logs: TeacherWrongLog[];
  total: number;
  colors: ReturnType<typeof useColors>;
}) {
  if (logs.length === 0) {
    return (
      <View style={sectionStyles.emptyWrap}>
        <Text style={[sectionStyles.emptyText, { color: colors.subtitle }]}>🎉 没有错题记录</Text>
      </View>
    );
  }
  return (
    <ScrollView contentContainerStyle={sectionStyles.list}>
      <View style={[sectionStyles.summaryCard, { backgroundColor: colors.card }]}>
        <Text style={[sectionStyles.summaryTitle, { color: colors.text }]}>错题 {total} 条</Text>
      </View>
      {logs.map((w) => (
        <View key={w.word_id} style={[sectionStyles.card, { backgroundColor: colors.card }]}>
          <View style={sectionStyles.row}>
            <Text style={[sectionStyles.cardTitle, { color: colors.text }]}>{w.word}</Text>
            <Text style={[sectionStyles.rate, { color: '#E5484D' }]}>×{w.wrong_count}</Text>
          </View>
          <Text style={[sectionStyles.subtitle, { color: colors.pinyin }]}>{w.translation}</Text>
          <Text style={[sectionStyles.meta, { color: colors.subtitle }]}>
            最近错误: {new Date(w.last_wrong_ts).toLocaleDateString()} · {w.sources || '练习'}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

/* ── Styles ────────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  backBtn: { padding: 4 },
  title: { fontSize: 22, fontWeight: '700' },
  statsBar: {
    flexDirection: 'row',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    justifyContent: 'space-around',
  },
  wbScroll: { marginBottom: 12, maxHeight: 44 },
  wbChip: {
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 8,
  },
  wbChipText: { fontSize: 14, fontWeight: '600' },
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
  tabText: { fontSize: 13, fontWeight: '600' },
  errorText: { fontSize: 16, textAlign: 'center', marginTop: 80 },
  summaryCard: { borderRadius: 14, padding: 14, marginBottom: 4 },
  summaryTitle: { fontSize: 15, fontWeight: '700' },
  summaryHint: { fontSize: 12, marginTop: 2 },
});

const sectionStyles = StyleSheet.create({
  list: { gap: 10, paddingBottom: 40 },
  card: { borderRadius: 14, padding: 14 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  subtitle: { fontSize: 13, marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rate: { fontSize: 16, fontWeight: '700' },
  meta: { fontSize: 12 },
  summaryCard: { borderRadius: 14, padding: 14, marginBottom: 4 },
  summaryTitle: { fontSize: 15, fontWeight: '700' },
  summaryHint: { fontSize: 12, marginTop: 2 },
  miniStat: { alignItems: 'center' },
  miniNum: { fontSize: 20, fontWeight: '800' },
  miniLabel: { fontSize: 10, color: '#9C8F7E', marginTop: 2 },
  emptyWrap: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 15 },
});
