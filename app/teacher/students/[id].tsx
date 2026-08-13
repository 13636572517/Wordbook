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

const USE_CLOUD = process.env.EXPO_PUBLIC_USE_CLOUD === 'true';

type Section = 'overview' | 'checkin' | 'weak' | 'az' | 'wrong';
const SECTIONS: { key: Section; label: string }[] = [
  { key: 'overview', label: '概览' },
  { key: 'checkin', label: '打卡' },
  { key: 'weak', label: '薄弱词' },
  { key: 'az', label: 'A-Z' },
  { key: 'wrong', label: '错题' },
];

const DAY_MS = 24 * 60 * 60 * 1000;

function letterOf(word: string): string {
  const ch = (word.charAt(0) || '').toUpperCase();
  return /[A-Z]/.test(ch) ? ch : '#';
}

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
  const weakIds = useMemo(() => new Set(weakWords.map((w) => w.word_id)), [weakWords]);

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
        setWordbooks(wbs.filter((w: Wordbook) => w.type === 'system'));
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
        if ((s === 'overview' || s === 'checkin' || s === 'az') && summaryKey !== key) {
          const d = await fetchStudentProgress(userId, wbId ?? undefined);
          setSummary(d);
          setSummaryKey(key);
        }
        if ((s === 'weak' || s === 'az') && weakKey !== key) {
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
        if (s === 'az' && wbId != null && azKey !== key) {
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
      ) : section === 'overview' ? (
        <OverviewSection summary={summary} colors={colors} />
      ) : section === 'checkin' ? (
        <CheckinSection summary={summary} colors={colors} />
      ) : section === 'weak' ? (
        <WeakSection words={weakWords} colors={colors} />
      ) : section === 'az' ? (
        <AZSection
          summary={summary}
          azWords={azWords}
          weakIds={weakIds}
          hasWordbook={selectedWb != null}
          colors={colors}
        />
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

function OverviewSection({ summary, colors }: { summary: StudentProgressSummary | null; colors: ReturnType<typeof useColors> }) {
  if (!summary) return <EmptyHint text="暂无数据" colors={colors} />;
  const { total, learned, mastered, learning, due } = summary.wordbook;
  const pct = total > 0 ? Math.round((learned / total) * 100) : 0;
  return (
    <ScrollView contentContainerStyle={sectionStyles.list}>
      <View style={[sectionStyles.card, { backgroundColor: colors.card }]}>
        <Text style={[sectionStyles.cardTitle, { color: colors.text }]}>词本完成度</Text>
        <View style={[sectionStyles.barBg, { marginTop: 12 }]}>
          <View style={[sectionStyles.barFill, { width: `${pct}%` as any, backgroundColor: colors.tint }]} />
        </View>
        <Text style={[sectionStyles.meta, { color: colors.subtitle, marginTop: 8 }]}>
          已学 {learned}/{total}（{pct}%）
        </Text>
        <View style={{ flexDirection: 'row', marginTop: 14 }}>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={[sectionStyles.miniNum, { color: '#30A46C' }]}>{mastered}</Text>
            <Text style={sectionStyles.miniLabel}>已掌握</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={[sectionStyles.miniNum, { color: '#F5A623' }]}>{learning}</Text>
            <Text style={sectionStyles.miniLabel}>学习中</Text>
          </View>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={[sectionStyles.miniNum, { color: due > 0 ? '#E5484D' : colors.text }]}>{due}</Text>
            <Text style={sectionStyles.miniLabel}>待复习</Text>
          </View>
        </View>
      </View>
      <View style={[sectionStyles.card, { backgroundColor: colors.card }]}>
        <Text style={[sectionStyles.cardTitle, { color: colors.text }]}>今日学习</Text>
        <View style={{ flexDirection: 'row', gap: 20, marginTop: 10 }}>
          <Text style={[sectionStyles.label, { color: colors.subtitle }]}>
            新词 <Text style={{ color: colors.tint, fontWeight: '700' }}>{summary.today.new_words}</Text> 个
          </Text>
          <Text style={[sectionStyles.label, { color: colors.subtitle }]}>
            复习 <Text style={{ color: colors.tint, fontWeight: '700' }}>{summary.today.review_words}</Text> 词
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

function checkinColor(count: number): string {
  if (count === 0) return 'rgba(128,128,128,0.15)';
  if (count < 30) return 'rgba(48,164,108,0.3)';
  if (count < 60) return 'rgba(48,164,108,0.6)';
  return '#30A46C';
}

function CheckinSection({ summary, colors }: { summary: StudentProgressSummary | null; colors: ReturnType<typeof useColors> }) {
  const [selected, setSelected] = useState<string | null>(null);
  if (!summary) return <EmptyHint text="暂无数据" colors={colors} />;
  const sel = summary.checkin.find((c) => c.date === selected);
  return (
    <ScrollView contentContainerStyle={sectionStyles.list}>
      <View style={[sectionStyles.card, { backgroundColor: colors.card }]}>
        <Text style={[sectionStyles.cardTitle, { color: colors.text }]}>近 30 天打卡</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 12 }}>
          {summary.checkin.map((c) => (
            <TouchableOpacity
              key={c.date}
              style={{
                width: '15.6%',
                aspectRatio: 1,
                margin: '0.5%',
                borderRadius: 6,
                backgroundColor: checkinColor(c.count),
                borderWidth: selected === c.date ? 2 : 0,
                borderColor: colors.tint,
              }}
              onPress={() => setSelected(c.date === selected ? null : c.date)}
            />
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 14, marginTop: 12 }}>
          {[['未学', 'rgba(128,128,128,0.15)'], ['<30', 'rgba(48,164,108,0.3)'], ['30-59', 'rgba(48,164,108,0.6)'], ['≥60', '#30A46C']].map(([label, bg]) => (
            <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: bg as string }} />
              <Text style={[sectionStyles.meta, { color: colors.subtitle }]}>{label}</Text>
            </View>
          ))}
        </View>
        {sel && (
          <View style={[{ borderRadius: 10, padding: 12, marginTop: 12, backgroundColor: colors.background }]}>
            <Text style={[sectionStyles.label, { color: colors.text }]}>
              {sel.date}：学习 {sel.count} 次 · 新学 {sel.new_count} 词
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function reasonTag(w: TeacherWeakWord): string {
  switch (w.reason) {
    case 'recent':
      return `近期错 ${w.wrong} 次`;
    case 'overdue':
      return `逾期 ${Math.max(1, Math.floor((Date.now() - w.due) / DAY_MS))} 天`;
    case 'stale':
      return '未巩固';
    default:
      return `错 ${w.wrong} 次 · ${Math.round(w.error_rate * 100)}%`;
  }
}

function WeakSection({ words, colors }: { words: TeacherWeakWord[]; colors: ReturnType<typeof useColors> }) {
  if (words.length === 0) {
    return <EmptyHint text="🎉 没有薄弱单词" colors={colors} />;
  }
  return (
    <ScrollView contentContainerStyle={sectionStyles.list}>
      <View style={[sectionStyles.summaryCard, { backgroundColor: colors.card }]}>
        <Text style={[sectionStyles.summaryTitle, { color: colors.text }]}>薄弱单词 {words.length} 个</Text>
        <Text style={[sectionStyles.summaryHint, { color: colors.subtitle }]}>
          错误率高 / 近期屡错 / 逾期超3天 / 学了7天仍未巩固（排除已掌握）
        </Text>
      </View>
      {words.map((w) => (
        <View key={w.word_id} style={[sectionStyles.card, { backgroundColor: colors.card }]}>
          <View style={sectionStyles.row}>
            <Text style={[sectionStyles.cardTitle, { color: colors.text }]}>{w.word}</Text>
            <Text style={[sectionStyles.weakTag, { color: '#E5484D' }]}>{reasonTag(w)}</Text>
          </View>
          <Text style={[sectionStyles.subtitle, { color: colors.pinyin }]} numberOfLines={1}>{w.translation}</Text>
          <Text style={[sectionStyles.meta, { color: colors.subtitle, marginTop: 6 }]}>
            EF {w.ef.toFixed(1)} · 对{w.correct}/错{w.wrong} · 复习{w.repetitions}轮
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

type ProgItem = StudentProgressSummary['progress'][number];

function AZSection({
  summary, azWords, weakIds, hasWordbook, colors,
}: {
  summary: StudentProgressSummary | null;
  azWords: { id: string; word: string }[] | null;
  weakIds: Set<number>;
  hasWordbook: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);
  if (!summary) return <EmptyHint text="暂无数据" colors={colors} />;

  const progByNumId = new Map<number, ProgItem>();
  for (const p of summary.progress) progByNumId.set(p.word_id, p);

  // 按首字母分组：具体词本用全量词表（含未学词），全部词本模式只列已学词
  const groups = new Map<string, { total: number; learned: number; rows: { word: string; prog: ProgItem | null }[] }>();
  const ensure = (letter: string) => {
    if (!groups.has(letter)) groups.set(letter, { total: 0, learned: 0, rows: [] });
    return groups.get(letter)!;
  };
  if (hasWordbook && azWords) {
    for (const w of azWords) {
      const g = ensure(letterOf(w.word));
      g.total += 1;
      const prog = progByNumId.get(Number(w.id)) ?? null;
      if (prog) g.learned += 1;
      g.rows.push({ word: w.word, prog });
    }
  } else {
    for (const p of summary.progress) {
      const g = ensure(letterOf(p.word));
      g.total += 1;
      g.learned += 1;
      g.rows.push({ word: p.word, prog: p });
    }
  }
  const letters = [...groups.keys()].sort();

  const statusColor = (wordId: number | undefined, prog: ProgItem | null): string => {
    if (wordId != null && weakIds.has(wordId)) return '#E5484D';
    if (!prog) return 'rgba(128,128,128,0.4)';
    if (prog.repetitions >= 3) return '#30A46C';
    return '#F5A623';
  };

  return (
    <ScrollView contentContainerStyle={sectionStyles.list}>
      {!hasWordbook && (
        <Text style={[sectionStyles.summaryHint, { color: colors.subtitle, marginBottom: 8 }]}>
          当前为全部词本汇总，选择具体词本可查看完整 A-Z 单词列表
        </Text>
      )}
      {letters.map((letter) => {
        const g = groups.get(letter)!;
        const isOpen = expanded === letter;
        return (
          <View key={letter}>
            <TouchableOpacity
              style={[sectionStyles.card, { backgroundColor: colors.card, marginBottom: isOpen ? 0 : 10 }]}
              onPress={() => setExpanded(isOpen ? null : letter)}
              activeOpacity={0.7}
            >
              <View style={sectionStyles.row}>
                <Text style={[sectionStyles.cardTitle, { color: colors.text }]}>
                  {letter} · 已学 {g.learned}{hasWordbook ? `/${g.total}` : ''}
                </Text>
                <FontAwesome name={isOpen ? 'chevron-down' : 'chevron-right'} size={13} color={colors.subtitle} />
              </View>
              <View style={[sectionStyles.barBg, { marginTop: 8 }]}>
                <View style={[sectionStyles.barFill, { width: `${g.total > 0 ? Math.round((g.learned / g.total) * 100) : 0}%` as any, backgroundColor: colors.tint }]} />
              </View>
            </TouchableOpacity>
            {isOpen && (
              <View style={[sectionStyles.azBody, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {g.rows.map((r) => (
                  <View key={r.word} style={sectionStyles.azRow}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: statusColor(r.prog?.word_id, r.prog) }} />
                    <Text style={[sectionStyles.azWord, { color: colors.text }]}>{r.word}</Text>
                    {r.prog && (
                      <Text style={[sectionStyles.meta, { color: colors.subtitle }]} numberOfLines={1}>
                        {r.prog.repetitions >= 3 ? '已掌握' : `复习${r.prog.repetitions}轮`}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            )}
          </View>
        );
      })}
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
  tabText: { fontSize: 13, fontWeight: '600' },
  errorText: { fontSize: 16, textAlign: 'center', marginTop: 80 },
});

const sectionStyles = StyleSheet.create({
  list: { gap: 10, paddingBottom: 40 },
  card: { borderRadius: 14, padding: 14 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  subtitle: { fontSize: 13, marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 13 },
  rate: { fontSize: 16, fontWeight: '700' },
  meta: { fontSize: 12 },
  weakTag: { fontSize: 12, fontWeight: '700' },
  barBg: { height: 6, backgroundColor: '#2A2520', borderRadius: 3 },
  barFill: { height: 6, borderRadius: 3 },
  summaryCard: { borderRadius: 14, padding: 14, marginBottom: 4 },
  summaryTitle: { fontSize: 15, fontWeight: '700' },
  summaryHint: { fontSize: 12, marginTop: 2 },
  miniStat: { alignItems: 'center' },
  miniNum: { fontSize: 20, fontWeight: '800' },
  miniLabel: { fontSize: 10, color: '#9C8F7E', marginTop: 2 },
  azBody: {
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    borderWidth: 1,
    borderTopWidth: 0,
    paddingHorizontal: 14,
    paddingVertical: 6,
    marginBottom: 10,
  },
  azRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  azWord: { fontSize: 14, fontWeight: '600', flex: 1 },
  emptyWrap: { alignItems: 'center', marginTop: 60 },
  emptyText: { fontSize: 15 },
});
