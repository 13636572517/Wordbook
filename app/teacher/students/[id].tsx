import React, { useCallback, useEffect, useState } from 'react';
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
  fetchStudentDaily,
  fetchStudentWeakWords,
  fetchStudentWrongLogs,
  fetchStudents,
  type DailyProgress,
  type StudentInfo,
  type TeacherWeakWord,
  type TeacherWrongLog,
} from '@/lib/data/httpRepo';
import { repo, type Wordbook } from '@/lib/data';

const USE_CLOUD = process.env.EXPO_PUBLIC_USE_CLOUD === 'true';

type Section = 'daily' | 'weak' | 'wrong';

export default function TeacherStudentDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const userId = parseInt(id || '0', 10);

  const [student, setStudent] = useState<StudentInfo | null>(null);
  const [wordbooks, setWordbooks] = useState<Wordbook[]>([]);
  const [selectedWb, setSelectedWb] = useState<number | null>(null);
  const [section, setSection] = useState<Section>('daily');

  const [daily, setDaily] = useState<DailyProgress[]>([]);
  const [weakWords, setWeakWords] = useState<TeacherWeakWord[]>([]);
  const [wrongLogs, setWrongLogs] = useState<TeacherWrongLog[]>([]);
  const [wrongTotal, setWrongTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);

  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isAdmin, isTeacher } = useSession();

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
        // Only show system wordbooks for filtering
        setWordbooks(wbs.filter((w: Wordbook) => w.type === 'system'));
        if (wbs.length > 0) {
          setSelectedWb(null); // null = all wordbooks
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  // Load section data
  const loadSection = useCallback(
    async (s: Section, wbId: number | null) => {
      if (!userId) return;
      setDataLoading(true);
      try {
        if (s === 'daily') {
          const d = await fetchStudentDaily(userId, wbId ?? undefined);
          setDaily(d);
        } else if (s === 'weak') {
          const w = await fetchStudentWeakWords(userId, wbId ?? undefined);
          setWeakWords(w);
        } else if (s === 'wrong') {
          const wl = await fetchStudentWrongLogs(userId, wbId ?? undefined);
          setWrongLogs(wl.items);
          setWrongTotal(wl.total);
        }
      } catch {
        // ignore
      } finally {
        setDataLoading(false);
      }
    },
    [userId],
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
          style={[
            styles.wbChip,
            { backgroundColor: selectedWb === null ? colors.tint : colors.card },
          ]}
          onPress={() => setSelectedWb(null)}
          activeOpacity={0.7}
        >
          <Text style={[styles.wbChipText, { color: selectedWb === null ? '#0D0D0D' : colors.text }]}>
            全部词本
          </Text>
        </TouchableOpacity>
        {wordbooks.map((wb) => (
          <TouchableOpacity
            key={wb.id}
            style={[
              styles.wbChip,
              { backgroundColor: selectedWb === parseInt(wb.id) ? colors.tint : colors.card },
            ]}
            onPress={() => setSelectedWb(parseInt(wb.id))}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.wbChipText,
                { color: selectedWb === parseInt(wb.id) ? '#0D0D0D' : colors.text },
              ]}
            >
              {wb.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Tab bar */}
      <View style={styles.tabRow}>
        {(['daily', 'weak', 'wrong'] as Section[]).map((s) => (
          <TouchableOpacity
            key={s}
            style={[
              styles.tab,
              { borderBottomColor: section === s ? colors.tint : 'transparent' },
            ]}
            onPress={() => setSection(s)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                styles.tabText,
                { color: section === s ? colors.tint : colors.subtitle },
              ]}
            >
              {s === 'daily' ? '进度/正确率' : s === 'weak' ? '未掌握单词' : '练习错题'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Content */}
      {dataLoading ? (
        <ActivityIndicator size="large" color={colors.tint} style={{ marginTop: 40 }} />
      ) : section === 'daily' ? (
        <DailySection daily={daily} colors={colors} />
      ) : section === 'weak' ? (
        <WeakSection words={weakWords} colors={colors} />
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

function DailySection({ daily, colors }: { daily: DailyProgress[]; colors: ReturnType<typeof useColors> }) {
  if (daily.length === 0) {
    return <EmptyHint text="暂无学习记录" colors={colors} />;
  }
  return (
    <ScrollView contentContainerStyle={sectionStyles.list}>
      {daily.map((d) => (
        <View key={d.date} style={[sectionStyles.card, { backgroundColor: colors.card }]}>
          <Text style={[sectionStyles.cardTitle, { color: colors.text }]}>{d.date}</Text>
          <View style={sectionStyles.row}>
            <Text style={[sectionStyles.label, { color: colors.subtitle }]}>
              学习 {d.total} 词 · 新学 {d.new_count} 词
            </Text>
            <Text style={[sectionStyles.rate, { color: d.correct_rate >= 0.6 ? '#30A46C' : '#F5A623' }]}>
              {(d.correct_rate * 100).toFixed(0)}% 正确率
            </Text>
          </View>
          {/* mini progress bar */}
          <View style={sectionStyles.barBg}>
            <View
              style={[
                sectionStyles.barFill,
                {
                  width: `${Math.round(d.correct_rate * 100)}%` as any,
                  backgroundColor: d.correct_rate >= 0.6 ? '#30A46C' : '#F5A623',
                },
              ]}
            />
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

function WeakSection({ words, colors }: { words: TeacherWeakWord[]; colors: ReturnType<typeof useColors> }) {
  if (words.length === 0) {
    return <EmptyHint text="🎉 没有未掌握单词" colors={colors} />;
  }
  return (
    <ScrollView contentContainerStyle={sectionStyles.list}>
      {/* Summary */}
      <View style={[sectionStyles.summaryCard, { backgroundColor: colors.card }]}>
        <Text style={[sectionStyles.summaryTitle, { color: colors.text }]}>
          未掌握单词 {words.length} 个
        </Text>
        <Text style={[sectionStyles.summaryHint, { color: colors.subtitle }]}>
          错率&gt;=34% 或 EF&lt;1.8（排除已掌握）
        </Text>
      </View>
      {words.map((w) => (
        <View key={w.word_id} style={[sectionStyles.card, { backgroundColor: colors.card }]}>
          <Text style={[sectionStyles.cardTitle, { color: colors.text }]}>{w.word}</Text>
          <Text style={[sectionStyles.subtitle, { color: colors.pinyin }]}>{w.translation}</Text>
          <View style={sectionStyles.row}>
            <Text style={[sectionStyles.meta, { color: colors.subtitle }]}>
              EF {w.ef.toFixed(1)} · 对{w.correct}/错{w.wrong}
            </Text>
            <Text style={[sectionStyles.rate, { color: '#E5484D' }]}>{(w.error_rate * 100).toFixed(0)}% 错率</Text>
          </View>
        </View>
      ))}
    </ScrollView>
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
    return <EmptyHint text="🎉 没有错题记录" colors={colors} />;
  }
  return (
    <ScrollView contentContainerStyle={sectionStyles.list}>
      <View style={[sectionStyles.summaryCard, { backgroundColor: colors.card }]}>
        <Text style={[sectionStyles.summaryTitle, { color: colors.text }]}>
          错题 {total} 条
        </Text>
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

function EmptyHint({ text, colors }: { text: string; colors: ReturnType<typeof useColors> }) {
  return (
    <View style={sectionStyles.emptyWrap}>
      <Text style={[sectionStyles.emptyText, { color: colors.subtitle }]}>{text}</Text>
    </View>
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
  tabText: { fontSize: 14, fontWeight: '600' },
  errorText: { fontSize: 16, textAlign: 'center', marginTop: 80 },
});

const sectionStyles = StyleSheet.create({
  list: { gap: 10, paddingBottom: 40 },
  card: { borderRadius: 14, padding: 14 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  subtitle: { fontSize: 13, marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  label: { fontSize: 13 },
  rate: { fontSize: 16, fontWeight: '700' },
  meta: { fontSize: 12 },
  barBg: { height: 6, backgroundColor: '#2A2520', borderRadius: 3, marginTop: 8 },
  barFill: { height: 6, borderRadius: 3 },
  summaryCard: { borderRadius: 14, padding: 14, marginBottom: 4 },
  summaryTitle: { fontSize: 15, fontWeight: '700' },
  summaryHint: { fontSize: 12, marginTop: 2 },
  miniStat: { alignItems: 'center' },
  miniNum: { fontSize: 20, fontWeight: '800' },
  miniLabel: { fontSize: 10, color: '#9C8F7E', marginTop: 2 },
  emptyWrap: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 15 },
});
