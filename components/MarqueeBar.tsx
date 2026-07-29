import type { DailyProgress } from '@/lib/dailyProgress';
import useColors from '@/components/useColors';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function MarqueeBar({ progress }: { progress: DailyProgress | null }) {
  const colors = useColors();
  if (!progress) return null;
  const label = progress.dueWords > 0
    ? `待复习 ${progress.dueWords} 个`
    : progress.todayNewWords < progress.dailyNewWordGoal
      ? `今日新词 ${progress.todayNewWords} / ${progress.dailyNewWordGoal}`
      : `今日练习 ${progress.todayQuizCount} / ${progress.dailyQuizGoal}`;
  return <View style={[styles.bar, { backgroundColor: colors.card, borderColor: colors.border }]}><Text style={[styles.text, { color: colors.text }]}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  bar: { marginHorizontal: 20, marginBottom: 8, borderWidth: 1, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 8 },
  text: { fontSize: 13, fontWeight: '600' },
});
