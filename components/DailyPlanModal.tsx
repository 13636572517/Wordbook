import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DailyProgress } from '@/lib/dailyProgress';
import useColors from '@/components/useColors';
import Confetti from '@/components/Confetti';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

type PromptPhase = 'start' | 'complete' | null;

export default function DailyPlanModal({ userId, progress, enabled }: { userId?: string; progress: DailyProgress | null; enabled: boolean }) {
  const colors = useColors();
  const [phase, setPhase] = useState<PromptPhase>(null);
  useEffect(() => {
    if (!userId || !progress || !enabled) return;
    const date = new Date().toLocaleDateString('sv-SE');
    const key = `wb_daily_progress_${userId}_${date}_${progress.allDone ? 'complete' : 'start'}`;
    AsyncStorage.getItem(key).then((shown) => {
      if (!shown) setPhase(progress.allDone ? 'complete' : 'start');
    });
  }, [userId, progress, enabled]);
  const close = async () => {
    if (userId && phase) {
      const date = new Date().toLocaleDateString('sv-SE');
      await AsyncStorage.setItem(`wb_daily_progress_${userId}_${date}_${phase}`, '1');
    }
    setPhase(null);
  };
  if (!progress) return null;
  const completed = phase === 'complete';
  const rows = [
    { label: '新词', value: progress.todayNewWords, goal: progress.dailyNewWordGoal, color: '#30A46C' },
    { label: '练习', value: progress.todayQuizCount, goal: progress.dailyQuizGoal, color: '#3B82F6' },
  ];
  return <Modal visible={phase != null} transparent animationType="fade" onRequestClose={close}><View style={styles.overlay}><View style={[styles.dialog, { backgroundColor: colors.card, borderColor: colors.border }]}>
    <Confetti visible={completed} />
    <View style={[styles.icon, { backgroundColor: completed ? '#30A46C22' : colors.tint + '22' }]}><FontAwesome name={completed ? 'check' : 'calendar-check-o'} size={24} color={completed ? '#30A46C' : colors.tint} /></View>
    <Text style={[styles.title, { color: colors.text }]}>{completed ? '今日学习完成' : '今天，开始得很不错'}</Text>
    <Text style={[styles.subtitle, { color: colors.subtitle }]}>{completed ? `已完成 ${progress.todayNewWords} 个新词和 ${progress.todayQuizCount} 道练习` : `当前词本已学习 ${progress.learnedWords} / ${progress.totalWords} 个单词`}</Text>
    <View style={styles.rows}>{rows.map((row) => <View key={row.label} style={styles.row}><View style={styles.rowTop}><Text style={[styles.line, { color: colors.text }]}>{row.label}</Text><Text style={[styles.value, { color: colors.subtitle }]}>{row.value} / {row.goal}</Text></View><View style={[styles.track, { backgroundColor: colors.background }]}><View style={[styles.fill, { width: `${Math.min(100, row.goal > 0 ? row.value / row.goal * 100 : 0)}%`, backgroundColor: row.color }]} /></View></View>)}</View>
    <View style={[styles.review, { backgroundColor: colors.background }]}><FontAwesome name="refresh" size={14} color={progress.dueWords > 0 ? '#F5A623' : '#30A46C'} /><Text style={[styles.reviewText, { color: colors.subtitle }]}>{progress.dueWords > 0 ? `还有 ${progress.dueWords} 个到期词等待复习` : '到期复习已清空'}</Text></View>
    <TouchableOpacity onPress={close} style={[styles.button, { backgroundColor: colors.tint }]}><Text style={styles.buttonText}>{completed ? '收下这份进度' : '开始学习'}</Text></TouchableOpacity>
  </View></View></Modal>;
}
const styles = StyleSheet.create({ overlay: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.56)' }, dialog: { borderRadius: 8, borderWidth: 1, padding: 24, overflow: 'hidden' }, icon: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', marginBottom: 16 }, title: { fontSize: 22, fontWeight: '700', marginBottom: 8 }, subtitle: { fontSize: 14, lineHeight: 21, marginBottom: 22 }, rows: { gap: 16 }, row: { gap: 7 }, rowTop: { flexDirection: 'row', justifyContent: 'space-between' }, line: { fontSize: 14, fontWeight: '700' }, value: { fontSize: 13 }, track: { height: 7, borderRadius: 4, overflow: 'hidden' }, fill: { height: '100%', borderRadius: 4 }, review: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 6, padding: 12, marginTop: 20 }, reviewText: { fontSize: 13 }, button: { marginTop: 20, alignItems: 'center', borderRadius: 6, paddingVertical: 13 }, buttonText: { color: '#0D0D0D', fontWeight: '700' } });
