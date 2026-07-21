import React, { useState } from 'react';
import { StyleSheet, View, Text, ActivityIndicator, ScrollView, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import useColors from '@/components/useColors';
import useLanguage from '@/components/useLanguage';
import { getAllWords, Word } from '@/lib/database';
import { getWeakWords } from '@/lib/weakWords';
import { setPriorityIds } from '@/lib/quizSelection';

export default function WeakScreen() {
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const colors = useColors();
  const { language, refresh } = useLanguage();
  const insets = useSafeAreaInsets();

  useFocusEffect(
    React.useCallback(() => {
      let cancelled = false;
      (async () => {
        const code = await refresh();
        if (cancelled) return;
        const all = await getAllWords(code);
        if (cancelled) return;
        setWords(getWeakWords(all));
        setLoading(false);
      })();
      return () => {
        cancelled = true;
      };
    }, [refresh])
  );

  const repractice = (ids: number[]) => {
    setPriorityIds(ids);
    router.push('/(tabs)');
  };

  if (loading || !language) {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: colors.background, paddingTop: insets.top },
        ]}
      >
        <ActivityIndicator size="large" color={colors.tint} />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: insets.top },
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.heading, { color: colors.text }]}>薄弱词</Text>
        {words.length > 0 && (
          <TouchableOpacity
            style={[styles.repracticeAll, { backgroundColor: colors.tint }]}
            onPress={() => repractice(words.map((w) => w.id))}
            activeOpacity={0.8}
          >
            <FontAwesome name="refresh" size={14} color="#0D0D0D" />
            <Text style={styles.repracticeAllText}>重练全部</Text>
          </TouchableOpacity>
        )}
      </View>

      {words.length === 0 ? (
        <View style={styles.empty}>
          <Text style={[styles.emptyIcon, { color: colors.subtitle }]}>💪</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>暂无薄弱词</Text>
          <Text style={[styles.emptySubtitle, { color: colors.subtitle }]}>
            连续答对、错误率低的词会自动保持"已掌握"，这里只会聚集需要加强的词。
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {words.map((w) => (
            <View key={w.id} style={[styles.row, { backgroundColor: colors.card }]}>
              <View style={styles.rowMain}>
                <Text style={[styles.word, { color: colors.text }]}>{w.word}</Text>
                <Text style={[styles.translation, { color: colors.subtitle }]}>
                  {w.translation}
                </Text>
              </View>
              <View style={styles.rowMeta}>
                <View style={[styles.badge, { backgroundColor: '#E5484D22' }]}>
                  <Text style={styles.badgeText}>错 {w.wrong}</Text>
                </View>
                <Text style={[styles.ef, { color: colors.subtitle }]}>
                  EF {w.ef.toFixed(2)}
                </Text>
                <TouchableOpacity
                  style={[styles.repracticeBtn, { borderColor: colors.tint }]}
                  onPress={() => repractice([w.id])}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.repracticeBtnText, { color: colors.tint }]}>
                    重练
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  repracticeAll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 18,
  },
  repracticeAllText: {
    color: '#0D0D0D',
    fontSize: 14,
    fontWeight: '700',
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 60,
  },
  emptyIcon: {
    fontSize: 56,
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    paddingHorizontal: 24,
  },
  list: {
    paddingBottom: 24,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    gap: 12,
  },
  rowMain: {
    flex: 1,
  },
  word: {
    fontSize: 17,
    fontWeight: '700',
  },
  translation: {
    fontSize: 13,
    marginTop: 2,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  badge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  badgeText: {
    color: '#E5484D',
    fontSize: 12,
    fontWeight: '700',
  },
  ef: {
    fontSize: 12,
  },
  repracticeBtn: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  repracticeBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
