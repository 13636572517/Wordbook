import React, { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import useColors from '@/components/useColors';
import { fetchStudentDailyDetail, type StudentDailyDetail } from '@/lib/data/httpRepo';

const TYPE_LABEL: Record<string, string> = { dictation: '默写', choice: '选择', phrase: '词组默写', 'phrase-blank': '词组填空', 'sentence-choice': '例句选择', unknown: '历史练习（题型未知）' };
const GRADE_LABEL = ['错误', '困难', '掌握', '熟练'];

export default function StudentDailyDetailScreen() {
  const { id, date, wordbookId } = useLocalSearchParams<{ id: string; date: string; wordbookId?: string }>();
  const [detail, setDetail] = useState<StudentDailyDetail | null>(null);
  const [error, setError] = useState(false);
  const router = useRouter();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const returnToStudent = () => {
    router.replace({ pathname: '/teacher/students/[id]' as any, params: { id: String(id) } });
  };
  useEffect(() => {
    fetchStudentDailyDetail(Number(id), date, wordbookId ? Number(wordbookId) : undefined).then(setDetail).catch(() => setError(true));
  }, [id, date, wordbookId]);
  if (!detail && !error) return <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}><ActivityIndicator color={colors.tint} style={{ marginTop: 60 }} /></View>;
  if (error || !detail) return <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}><TouchableOpacity onPress={returnToStudent} style={styles.back}><FontAwesome name="arrow-left" size={16} color={colors.tint} /></TouchableOpacity><Text style={[styles.empty, { color: colors.subtitle }]}>学习明细加载失败</Text></View>;
  const s = detail.summary;
  return <View style={[styles.root, { backgroundColor: colors.background, paddingTop: insets.top }]}>
    <View style={styles.header}><TouchableOpacity onPress={returnToStudent} style={styles.back}><FontAwesome name="arrow-left" size={16} color={colors.tint} /></TouchableOpacity><View><Text style={[styles.title, { color: colors.text }]}>{detail.date}</Text><Text style={[styles.sub, { color: colors.subtitle }]}>学习明细</Text></View></View>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.grid}>{[['新词', s.new_words], ['复习词', s.review_words], ['作答', s.total_attempts], ['正确率', `${Math.round(s.correct_rate * 100)}%`]].map(([label, value]) => <View key={String(label)} style={[styles.stat, { backgroundColor: colors.card }]}><Text style={[styles.statValue, { color: colors.text }]}>{value}</Text><Text style={[styles.sub, { color: colors.subtitle }]}>{label}</Text></View>)}</View>
      <Text style={[styles.section, { color: colors.subtitle }]}>练习题型</Text>
      {detail.practice_types.length === 0 ? <Text style={[styles.empty, { color: colors.subtitle }]}>当天没有练习记录</Text> : detail.practice_types.map((item) => <View key={item.activity_type} style={[styles.row, { backgroundColor: colors.card }]}><Text style={[styles.word, { color: colors.text }]}>{TYPE_LABEL[item.activity_type] ?? item.activity_type}</Text><Text style={[styles.sub, { color: colors.subtitle }]}>{item.total} 题 · 对 {item.correct} · {Math.round(item.correct_rate * 100)}%</Text></View>)}
      <Text style={[styles.section, { color: colors.subtitle }]}>单词明细</Text>
      {detail.words.map((item) => <View key={item.word_id} style={[styles.row, { backgroundColor: colors.card }]}><View><Text style={[styles.word, { color: colors.text }]}>{item.word}</Text><Text style={[styles.sub, { color: colors.subtitle }]}>{item.translation}</Text><Text style={[styles.sub, { color: colors.subtitle }]}>学习 {item.study_count} · 练习 {item.quiz_count} · 复习 {item.review_count}</Text></View><View style={styles.right}><Text style={[styles.result, { color: item.wrong_count ? '#E5484D' : '#30A46C' }]}>对 {item.correct_count} / 错 {item.wrong_count}</Text><Text style={[styles.sub, { color: colors.subtitle }]}>{GRADE_LABEL[item.last_grade] ?? '未知'} · {new Date(item.last_ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</Text></View></View>)}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({ root: { flex: 1 }, header: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 20 }, back: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' }, title: { fontSize: 22, fontWeight: '700' }, sub: { fontSize: 12, marginTop: 3 }, content: { padding: 20, paddingTop: 4, gap: 10 }, grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, stat: { width: '48%', borderRadius: 6, padding: 14 }, statValue: { fontSize: 21, fontWeight: '700' }, section: { fontSize: 13, fontWeight: '700', marginTop: 14, marginBottom: 2 }, row: { borderRadius: 6, padding: 14, flexDirection: 'row', justifyContent: 'space-between', gap: 12 }, word: { fontSize: 16, fontWeight: '700' }, right: { alignItems: 'flex-end' }, result: { fontSize: 13, fontWeight: '700' }, empty: { textAlign: 'center', marginTop: 40, fontSize: 14 } });
