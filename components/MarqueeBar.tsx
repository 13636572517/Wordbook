import type { DailyProgress } from '@/lib/dailyProgress';
import useColors from '@/components/useColors';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

// 首页每日进度条：文案 + 完成度可视化（原为纯文字静态条）
export default function MarqueeBar({ progress }: { progress: DailyProgress | null }) {
  const colors = useColors();
  if (!progress) return null;
  const label = progress.dueWords > 0
    ? `待复习 ${progress.dueWords} 个`
    : progress.todayNewWords < progress.dailyNewWordGoal
      ? `今日新词 ${progress.todayNewWords} / ${progress.dailyNewWordGoal}`
      : `今日练习 ${progress.todayQuizCount} / ${progress.dailyQuizGoal}`;
  // 当日整体完成度：新词目标与练习目标各占一半
  const newPct = progress.dailyNewWordGoal > 0 ? Math.min(progress.todayNewWords / progress.dailyNewWordGoal, 1) : 1;
  const quizPct = progress.dailyQuizGoal > 0 ? Math.min(progress.todayQuizCount / progress.dailyQuizGoal, 1) : 1;
  const pct = Math.round(((newPct + quizPct) / 2) * 100);
  // 有待复习词时用警示色，提醒优先清掉到期词
  const barColor = progress.dueWords > 0 ? colors.warning : colors.tint;
  return (
    <View style={[styles.bar, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.row}>
        <Text style={[styles.text, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.pct, { color: colors.subtitle }]}>{pct}%</Text>
      </View>
      <View style={[styles.track, { backgroundColor: colors.inputBackground }]}>
        <View style={[styles.fill, { width: `${pct}%`, backgroundColor: barColor }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { marginHorizontal: 20, marginBottom: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, gap: 6 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  text: { fontSize: 13, fontWeight: '600' },
  pct: { fontSize: 12, fontWeight: '600' },
  track: { height: 5, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 5, borderRadius: 3 },
});
