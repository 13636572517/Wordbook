// 学员学习进度共享 UI：教师端学员详情与学员端「统计」页复用。
// 概览卡 + 打卡日历（手机/PC 自适应格子）+ A-Z 分组（每组进度条）+ 薄弱词列表。
import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, useWindowDimensions } from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import useColors from './useColors';
import type { StudentProgressSummary, WeakWordEntry } from '@/lib/data/studentProgress';

const DAY_MS = 24 * 60 * 60 * 1000;

export function letterOf(word: string): string {
  const ch = (word.charAt(0) || '').toUpperCase();
  return /[A-Z]/.test(ch) ? ch : '#';
}

function checkinColor(count: number): string {
  if (count === 0) return 'rgba(128,128,128,0.15)';
  if (count < 30) return 'rgba(48,164,108,0.3)';
  if (count < 60) return 'rgba(48,164,108,0.6)';
  return '#30A46C';
}

export function reasonTag(w: WeakWordEntry): string {
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

/* ── 概览卡：词本完成度 + 今日学习 ─────────────────────────────────── */

export function OverviewCard({ summary, colors }: { summary: StudentProgressSummary; colors: ReturnType<typeof useColors> }) {
  const { total, learned, mastered, learning, due } = summary.wordbook;
  const pct = total > 0 ? Math.round((learned / total) * 100) : 0;
  return (
    <View style={[pStyles.card, { backgroundColor: colors.card }]}>
      <Text style={[pStyles.cardTitle, { color: colors.text }]}>词本完成度</Text>
      <View style={[pStyles.barBg, { marginTop: 12 }]}>
        <View style={[pStyles.barFill, { width: `${pct}%`, backgroundColor: colors.tint }]} />
      </View>
      <Text style={[pStyles.meta, { color: colors.subtitle, marginTop: 8 }]}>
        已学 {learned}/{total}（{pct}%）
      </Text>
      <View style={{ flexDirection: 'row', marginTop: 14 }}>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[pStyles.bigNum, { color: '#30A46C' }]}>{mastered}</Text>
          <Text style={pStyles.bigLabel}>已掌握</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[pStyles.bigNum, { color: '#F5A623' }]}>{learning}</Text>
          <Text style={pStyles.bigLabel}>学习中</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={[pStyles.bigNum, { color: due > 0 ? '#E5484D' : colors.text }]}>{due}</Text>
          <Text style={pStyles.bigLabel}>待复习</Text>
        </View>
      </View>
      <View style={[pStyles.todayRow, { backgroundColor: colors.background }]}>
        <Text style={[pStyles.meta, { color: colors.text }]}>
          今日新词 <Text style={{ color: colors.tint, fontWeight: '700' }}>{summary.today.new_words}</Text> 个
        </Text>
        <Text style={[pStyles.meta, { color: colors.text }]}>
          复习 <Text style={{ color: colors.tint, fontWeight: '700' }}>{summary.today.review_words}</Text> 词
        </Text>
      </View>
    </View>
  );
}

/* ── 打卡日历：格子大小随窗口宽度自适应（16~24px），手机/PC 通用 ───── */

export function CheckinCard({ summary, colors }: { summary: StudentProgressSummary; colors: ReturnType<typeof useColors> }) {
  const [selected, setSelected] = useState<string | null>(null);
  const { width } = useWindowDimensions();

  // 自适应格子：容器宽度受限，格子边长锁在 16~24px，列数随之变化
  const GAP = 4;
  const containerW = Math.min(Math.max(width - 78, 200), 640);
  let cols = Math.floor(containerW / (24 + GAP));
  cols = Math.max(6, Math.min(cols, 30));
  const cell = Math.min(24, Math.max(16, Math.floor((containerW - (cols - 1) * GAP) / cols)));

  const sel = summary.checkin.find((c) => c.date === selected);
  return (
    <View style={[pStyles.card, { backgroundColor: colors.card }]}>
      <Text style={[pStyles.cardTitle, { color: colors.text }]}>近 30 天打卡</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP, marginTop: 12, maxWidth: containerW }}>
        {summary.checkin.map((c) => (
          <TouchableOpacity
            key={c.date}
            style={{
              width: cell,
              height: cell,
              borderRadius: 4,
              backgroundColor: checkinColor(c.count),
              borderWidth: selected === c.date ? 1.5 : 0,
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
            <Text style={[pStyles.tinyMeta, { color: colors.subtitle }]}>{label}</Text>
          </View>
        ))}
      </View>
      {sel && (
        <View style={[{ borderRadius: 10, padding: 12, marginTop: 12, backgroundColor: colors.background }]}>
          <Text style={[pStyles.meta, { color: colors.text }]}>
            {sel.date}：学习 {sel.count} 次 · 新学 {sel.new_count} 词
          </Text>
        </View>
      )}
    </View>
  );
}

/* ── A-Z 分组：每字母组头带进度条，展开显示逐词状态 ───────────────── */

type ProgItem = StudentProgressSummary['progress'][number];

export function AZList({
  summary, azWords, weakIds, hasWordbook, colors,
}: {
  summary: StudentProgressSummary;
  azWords: { id: string; word: string }[] | null;
  weakIds: Set<string>;
  hasWordbook: boolean;
  colors: ReturnType<typeof useColors>;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const progByNumId = new Map<number, ProgItem>();
  for (const p of summary.progress) progByNumId.set(p.word_id, p);

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
    if (wordId != null && weakIds.has(String(wordId))) return '#E5484D';
    if (!prog) return 'rgba(128,128,128,0.4)';
    if (prog.repetitions >= 3) return '#30A46C';
    return '#F5A623';
  };

  return (
    <View>
      <Text style={[pStyles.cardTitle, { color: colors.text, marginBottom: 10 }]}>A-Z 进展</Text>
      {!hasWordbook && (
        <Text style={[pStyles.tinyMeta, { color: colors.subtitle, marginBottom: 8 }]}>
          当前为全部词本汇总，选择具体词本可查看完整 A-Z 单词列表
        </Text>
      )}
      {letters.map((letter) => {
        const g = groups.get(letter)!;
        const isOpen = expanded === letter;
        const groupPct = g.total > 0 ? Math.round((g.learned / g.total) * 100) : 0;
        return (
          <View key={letter}>
            <TouchableOpacity
              style={[pStyles.card, { backgroundColor: colors.card, marginBottom: isOpen ? 0 : 10 }]}
              onPress={() => setExpanded(isOpen ? null : letter)}
              activeOpacity={0.7}
            >
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[pStyles.cardTitle, { color: colors.text }]}>
                  {letter} · 已学 {g.learned}{hasWordbook ? `/${g.total}` : ''}
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={[pStyles.tinyMeta, { color: colors.tint, fontWeight: '700' }]}>{groupPct}%</Text>
                  <FontAwesome name={isOpen ? 'chevron-down' : 'chevron-right'} size={13} color={colors.subtitle} />
                </View>
              </View>
              <View style={[pStyles.barBg, { marginTop: 8 }]}>
                <View style={[pStyles.barFill, { width: `${groupPct}%`, backgroundColor: colors.tint }]} />
              </View>
            </TouchableOpacity>
            {isOpen && (
              <View style={[pStyles.azBody, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {g.rows.map((r) => (
                  <View key={r.word} style={pStyles.azRow}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: statusColor(r.prog?.word_id, r.prog) }} />
                    <Text style={[pStyles.azWord, { color: colors.text }]}>{r.word}</Text>
                    {r.prog && (
                      <Text style={[pStyles.tinyMeta, { color: colors.subtitle }]} numberOfLines={1}>
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
    </View>
  );
}

/* ── 薄弱词列表：原因标签 ──────────────────────────────────────────── */

export function WeakList({ words, colors }: { words: WeakWordEntry[]; colors: ReturnType<typeof useColors> }) {
  if (words.length === 0) {
    return (
      <View style={{ alignItems: 'center', marginTop: 40 }}>
        <Text style={[pStyles.meta, { color: colors.subtitle }]}>🎉 没有薄弱单词</Text>
      </View>
    );
  }
  return (
    <View style={{ gap: 10 }}>
      {words.map((w) => (
        <View key={w.word_id} style={[pStyles.card, { backgroundColor: colors.card }]}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <Text style={[pStyles.cardTitle, { color: colors.text }]}>{w.word}</Text>
            <Text style={{ fontSize: 12, fontWeight: '700', color: '#E5484D' }}>{reasonTag(w)}</Text>
          </View>
          <Text style={[pStyles.subtitle, { color: colors.pinyin }]} numberOfLines={1}>{w.translation}</Text>
          <Text style={[pStyles.tinyMeta, { color: colors.subtitle, marginTop: 6 }]}>
            EF {w.ef.toFixed(1)} · 对{w.correct}/错{w.wrong} · 复习{w.repetitions}轮
          </Text>
        </View>
      ))}
    </View>
  );
}

/* ── 合并概览（概览卡 + 打卡 + A-Z）：教师端概览 Tab / 学员统计页共用 ── */

export function StudentProgressOverview({
  summary, azWords, weakIds, hasWordbook,
}: {
  summary: StudentProgressSummary;
  azWords: { id: string; word: string }[] | null;
  weakIds: Set<string>;
  hasWordbook: boolean;
}) {
  const colors = useColors();
  return (
    <View style={{ gap: 12, paddingBottom: 40 }}>
      <OverviewCard summary={summary} colors={colors} />
      <CheckinCard summary={summary} colors={colors} />
      <AZList summary={summary} azWords={azWords} weakIds={weakIds} hasWordbook={hasWordbook} colors={colors} />
    </View>
  );
}

/* ── Styles ─────────────────────────────────────────────────────────── */

const pStyles = StyleSheet.create({
  card: { borderRadius: 14, padding: 14 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  subtitle: { fontSize: 13, marginTop: 4 },
  meta: { fontSize: 13 },
  tinyMeta: { fontSize: 12 },
  bigNum: { fontSize: 20, fontWeight: '800' },
  bigLabel: { fontSize: 10, color: '#9C8F7E', marginTop: 2 },
  barBg: { height: 6, backgroundColor: '#2A2520', borderRadius: 3, overflow: 'hidden' },
  barFill: { height: 6, borderRadius: 3 },
  todayRow: { flexDirection: 'row', justifyContent: 'space-between', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, marginTop: 14 },
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
});
