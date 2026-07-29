import { useDailyProgress } from '@/components/useDailyProgress';
import useColors from '@/components/useColors';
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

const isDesktopWeb = Platform.OS === 'web' && typeof window !== 'undefined' && !window.matchMedia('(display-mode: standalone)').matches && window.innerWidth >= 768;

export default function ProgressWidget() {
  const colors = useColors();
  const progress = useDailyProgress();
  const [collapsed, setCollapsed] = useState(false);
  if (!isDesktopWeb || !progress) return null;
  return <View style={[styles.wrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
    <Pressable onPress={() => setCollapsed((value) => !value)}><Text style={[styles.title, { color: colors.text }]}>今日进度</Text></Pressable>
    {!collapsed && <>
      <Text style={[styles.item, { color: colors.subtitle }]}>新词 {progress.todayNewWords} / {progress.dailyNewWordGoal}</Text>
      <Text style={[styles.item, { color: colors.subtitle }]}>练习 {progress.todayQuizCount} / {progress.dailyQuizGoal}</Text>
      <Text style={[styles.item, { color: colors.subtitle }]}>待复习 {progress.dueWords}</Text>
    </>}
  </View>;
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: 20, bottom: 24, zIndex: 20, width: 168, borderWidth: 1, borderRadius: 6, padding: 12 },
  title: { fontSize: 14, fontWeight: '700', marginBottom: 6 }, item: { fontSize: 12, lineHeight: 20 },
});
