import AsyncStorage from '@react-native-async-storage/async-storage';
import type { DailyProgress } from '@/lib/dailyProgress';
import useColors from '@/components/useColors';
import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function DailyPlanModal({ userId, progress, enabled }: { userId?: string; progress: DailyProgress | null; enabled: boolean }) {
  const colors = useColors();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!userId || !progress || !enabled) return;
    const key = `wb_daily_plan_${userId}_${new Date().toLocaleDateString('sv-SE')}`;
    AsyncStorage.getItem(key).then((shown) => { if (!shown) setVisible(true); });
  }, [userId, progress, enabled]);
  const close = async () => {
    if (userId) await AsyncStorage.setItem(`wb_daily_plan_${userId}_${new Date().toLocaleDateString('sv-SE')}`, '1');
    setVisible(false);
  };
  if (!progress) return null;
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={close}><View style={styles.overlay}><View style={[styles.dialog, { backgroundColor: colors.card }]}>
    <Text style={[styles.title, { color: colors.text }]}>今日学习计划</Text>
    <Text style={[styles.line, { color: colors.subtitle }]}>新词 {progress.todayNewWords} / {progress.dailyNewWordGoal}</Text>
    <Text style={[styles.line, { color: colors.subtitle }]}>练习 {progress.todayQuizCount} / {progress.dailyQuizGoal}</Text>
    <Text style={[styles.line, { color: colors.subtitle }]}>待复习 {progress.dueWords}</Text>
    <TouchableOpacity onPress={close} style={[styles.button, { backgroundColor: colors.tint }]}><Text style={styles.buttonText}>开始学习</Text></TouchableOpacity>
  </View></View></Modal>;
}
const styles = StyleSheet.create({ overlay: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.5)' }, dialog: { borderRadius: 8, padding: 22 }, title: { fontSize: 20, fontWeight: '700', marginBottom: 16 }, line: { fontSize: 15, lineHeight: 26 }, button: { marginTop: 20, alignItems: 'center', borderRadius: 6, paddingVertical: 12 }, buttonText: { color: '#0D0D0D', fontWeight: '700' } });
