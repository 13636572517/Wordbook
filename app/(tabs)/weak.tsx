import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import useColors from '@/components/useColors';
import { repo } from '@/lib/data';
import type { Word } from '@/lib/data';
import { getWeakWordIds } from '@/lib/data/weak';
import { setPriorityIds } from '@/lib/quizSelection';
import { useSession } from '@/components/SessionProvider';

export default function WeakScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, wordbook } = useSession();
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user || !wordbook) return;
    const weakIds = new Set(await getWeakWordIds(repo, user.id, wordbook.id));
    const all = await repo.getWordsByWordbook(wordbook.id);
    setWords(all.filter((w) => weakIds.has(w.id)));
    setLoading(false);
  }, [user, wordbook]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const practiceAll = () => {
    if (words.length === 0) return;
    setPriorityIds(words.map((w) => w.id));
    Alert.alert('已加入重练', '已把薄弱词加入重练队列，请切换到「Vocab」标签开始练习。');
  };

  const practiceOne = (w: Word) => {
    setPriorityIds([w.id]);
    Alert.alert('已加入重练', `「${w.word}」已加入重练队列，请切换到「Vocab」标签开始练习。`);
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: insets.top },
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>薄弱词</Text>
        {words.length > 0 && (
          <TouchableOpacity
            style={[styles.practiceBtn, { backgroundColor: colors.tint }]}
            onPress={practiceAll}
            activeOpacity={0.7}
          >
            <FontAwesome name="refresh" size={14} color="#0D0D0D" />
            <Text style={styles.practiceText}>重练全部</Text>
          </TouchableOpacity>
        )}
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.tint} />
      ) : words.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyIcon, { color: colors.subtitle }]}>💪</Text>
          <Text style={[styles.emptyText, { color: colors.subtitle }]}>
            「{wordbook?.name}」暂时没有薄弱词，继续保持！
          </Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          {words.map((w) => (
            <TouchableOpacity
              key={w.id}
              style={[styles.item, { backgroundColor: colors.card }]}
              onPress={() => practiceOne(w)}
              activeOpacity={0.7}
            >
              <View style={styles.itemMain}>
                <Text style={[styles.word, { color: colors.text }]}>{w.word}</Text>
                <Text style={[styles.trans, { color: colors.subtitle }]}>
                  {w.translation}
                </Text>
              </View>
              <FontAwesome name="chevron-right" size={14} color={colors.subtitle} />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  practiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  practiceText: {
    color: '#0D0D0D',
    fontSize: 14,
    fontWeight: '700',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingBottom: 60,
  },
  emptyIcon: {
    fontSize: 48,
  },
  emptyText: {
    fontSize: 15,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    padding: 16,
    marginBottom: 10,
  },
  itemMain: {
    flexDirection: 'column',
  },
  word: {
    fontSize: 18,
    fontWeight: '700',
  },
  trans: {
    fontSize: 14,
    marginTop: 2,
  },
});
