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
import { repo, httpRepo } from '@/lib/data';
import type { Word, WordDefinition, WordPhrase, WordExample } from '@/lib/data';
import { getWeakWordIds } from '@/lib/data/weak';
import { setPriorityIds } from '@/lib/quizSelection';
import { useSession } from '@/components/SessionProvider';

const isCloud = repo === httpRepo;

export default function WeakScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, wordbook } = useSession();
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detailMap, setDetailMap] = useState<Map<string, Word>>(new Map());
  const [loadingDetail, setLoadingDetail] = useState<string | null>(null);

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

  const handleWordPress = async (w: Word) => {
    if (expandedId === w.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(w.id);
    // 如果已有缓存直接展开，否则拉取完整释义
    if (detailMap.has(w.id)) return;
    setLoadingDetail(w.id);
    try {
      const full = await repo.getWord(w.id);
      if (full) {
        setDetailMap((prev) => new Map(prev).set(w.id, full));
        setWords((prev) => prev.map((x) => (x.id === w.id ? { ...x, ...full } : x)));
      }
    } catch { /* ignore */ }
    setLoadingDetail(null);
  };

  const handleRemediate = (w: Word) => {
    setPriorityIds([w.id]);
    Alert.alert('已加入重练', `「${w.word}」已加入重练队列。`);
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
            <React.Fragment key={w.id}>
            <TouchableOpacity
              key={w.id}
              style={[styles.item, { backgroundColor: colors.card }]}
              onPress={() => handleWordPress(w)}
              activeOpacity={0.7}
            >
              <View style={styles.itemMain}>
                <Text style={[styles.word, { color: colors.text }]}>{w.word}</Text>
                <Text style={[styles.trans, { color: colors.subtitle }]}>
                  {w.translation}
                </Text>
              </View>
              <View style={styles.itemRight}>
                <FontAwesome name={expandedId === w.id ? 'chevron-down' : 'chevron-right'} size={14} color={colors.subtitle} />
              </View>
            </TouchableOpacity>

            {/* 展开的释义区域 */}
            {expandedId === w.id && (
              <View style={[styles.detailCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                {loadingDetail === w.id ? (
                  <ActivityIndicator size="small" color={colors.tint} style={{ marginVertical: 12 }} />
                ) : (
                  <>
                    {/* 英文释义 */}
                    {w.definitions && w.definitions.length > 0 && (
                      <View style={styles.detailSection}>
                        <Text style={[styles.detailLabel, { color: colors.tint }]}>释义</Text>
                        {w.definitions.map((d: WordDefinition, i: number) => (
                          <Text key={i} style={[styles.detailText, { color: colors.text }]}>
                            <Text style={{ fontWeight: '600' }}>{d.pos.toLowerCase()}. </Text>
                            {d.definition}
                          </Text>
                        ))}
                      </View>
                    )}

                    {/* 词组 */}
                    {w.phrases && w.phrases.length > 0 && (
                      <View style={styles.detailSection}>
                        <Text style={[styles.detailLabel, { color: colors.tint }]}>词组</Text>
                        {w.phrases.map((p: WordPhrase, i: number) => (
                          <Text key={i} style={[styles.detailText, { color: colors.text }]}>
                            {p.phrase}{p.meaning ? `  ${p.meaning}` : ''}
                          </Text>
                        ))}
                      </View>
                    )}

                    {/* 例句 */}
                    {w.examples && w.examples.length > 0 && (
                      <View style={styles.detailSection}>
                        <Text style={[styles.detailLabel, { color: colors.tint }]}>例句</Text>
                        {w.examples.map((e: WordExample, i: number) => (
                          <View key={i} style={{ marginBottom: 4 }}>
                            <Text style={[styles.detailText, { color: colors.text }]}>{e.en}</Text>
                            {e.zh && <Text style={[styles.detailText, { color: colors.subtitle, fontSize: 13 }]}>{e.zh}</Text>}
                          </View>
                        ))}
                      </View>
                    )}

                    {/* 重练按钮 */}
                    <TouchableOpacity
                      style={[styles.remediateBtn, { backgroundColor: colors.tint }]}
                      onPress={() => handleRemediate(w)}
                      activeOpacity={0.7}
                    >
                      <FontAwesome name="refresh" size={12} color="#0D0D0D" />
                      <Text style={styles.remediateText}>重练此词</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}
            </React.Fragment>
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
  itemRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailCard: {
    marginHorizontal: 4,
    marginBottom: 10,
    marginTop: -4,
    borderBottomLeftRadius: 14,
    borderBottomRightRadius: 14,
    padding: 16,
    borderTopWidth: 0,
    borderWidth: 1,
  },
  detailSection: {
    marginBottom: 12,
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 4,
  },
  detailText: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 2,
  },
  remediateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginTop: 8,
  },
  remediateText: {
    color: '#0D0D0D',
    fontSize: 13,
    fontWeight: '700',
  },
});
