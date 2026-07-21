import React, { useState, useCallback, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useLocalSearchParams, router } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useColors from '@/components/useColors';
import { repo } from '@/lib/data';
import type { Word } from '@/lib/data';
import { lookupWord } from '@/lib/dictionary';
import { speakWord } from '@/lib/speech';
import { getLanguageByCode } from '@/lib/languages';

const ENGLISH = getLanguageByCode('en');

export default function WordbookDetailScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrichingId, setEnrichingId] = useState<string | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const batchCancelRef = useRef(false);

  const loadWords = useCallback(async () => {
    if (!id) return;
    const ws = await repo.getWordsByWordbook(id);
    // Sort alphabetically
    ws.sort((a, b) => a.word.localeCompare(b.word));
    setWords(ws);
    setLoading(false);
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      loadWords();
    }, [loadWords]),
  );

  // Enrich a single word with dictionary data
  const enrichWord = async (word: Word): Promise<boolean> => {
    setEnrichingId(word.id);
    const result = await lookupWord(word.word);
    setEnrichingId(null);
    if (!result) return false;

    const updated: Word = {
      ...word,
      phonetic: result.phonetic ?? word.phonetic,
      pronunciation: result.phonetic ?? word.pronunciation,
      definitions: result.definitions.length > 0 ? result.definitions : word.definitions,
      examples: result.examples.length > 0 ? result.examples : word.examples,
      phrases: result.phrases.length > 0 ? result.phrases : word.phrases,
      audioUrl: result.audioUrl ?? word.audioUrl,
    };
    await repo.upsertWord(updated);
    setWords((prev) => prev.map((w) => (w.id === word.id ? updated : w)));
    return true;
  };

  // Batch enrich all words that lack definitions
  const batchEnrich = async () => {
    const needEnrich = words.filter(
      (w) => !w.definitions || w.definitions.length === 0,
    );
    if (needEnrich.length === 0) {
      Alert.alert('提示', '所有单词都已有释义，无需补全。');
      return;
    }

    Alert.alert(
      '批量补全释义',
      `将为 ${needEnrich.length} 个缺少释义的单词查询词典。\n注意：免费 API 有限流，过程中可能有少量失败。`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '开始',
          onPress: async () => {
            batchCancelRef.current = false;
            setBatchRunning(true);
            setBatchProgress({ done: 0, total: needEnrich.length });
            let done = 0;
            for (const word of needEnrich) {
              if (batchCancelRef.current) break;
              const result = await lookupWord(word.word);
              if (result) {
                const updated: Word = {
                  ...word,
                  phonetic: result.phonetic ?? word.phonetic,
                  pronunciation: result.phonetic ?? word.pronunciation,
                  definitions: result.definitions.length > 0 ? result.definitions : word.definitions,
                  examples: result.examples.length > 0 ? result.examples : word.examples,
                  phrases: result.phrases.length > 0 ? result.phrases : word.phrases,
                  audioUrl: result.audioUrl ?? word.audioUrl,
                };
                await repo.upsertWord(updated);
                setWords((prev) => prev.map((w) => (w.id === word.id ? updated : w)));
              }
              done++;
              setBatchProgress({ done, total: needEnrich.length });
              // Rate limit: wait 300ms between requests
              await new Promise((r) => setTimeout(r, 300));
            }
            setBatchRunning(false);
            if (!batchCancelRef.current) {
              Alert.alert('完成', `已处理 ${done} 个单词的释义补全。`);
            }
          },
        },
      ],
    );
  };

  const enrichedCount = words.filter(
    (w) => w.definitions && w.definitions.length > 0,
  ).length;

  const renderWord = ({ item }: { item: Word }) => {
    const isExpanded = expandedId === item.id;
    const isEnriching = enrichingId === item.id;
    const hasEnrich = item.definitions && item.definitions.length > 0;

    return (
      <View style={[styles.wordCard, { backgroundColor: colors.card }]}>
        <TouchableOpacity
          style={styles.wordRow}
          onPress={() => setExpandedId(isExpanded ? null : item.id)}
          activeOpacity={0.7}
        >
          <View style={styles.wordMain}>
            <Text style={[styles.wordText, { color: colors.text }]}>
              {item.word}
            </Text>
            {(item.phonetic || item.pronunciation) && (
              <Text style={[styles.wordPhonetic, { color: colors.pinyin }]}>
                {item.phonetic || item.pronunciation}
              </Text>
            )}
            <Text style={[styles.wordTranslation, { color: colors.subtitle }]} numberOfLines={isExpanded ? undefined : 1}>
              {item.translation}
            </Text>
          </View>

          <View style={styles.wordActions}>
            {hasEnrich && (
              <View style={[styles.enrichedBadge, { backgroundColor: '#30A46C22' }]}>
                <FontAwesome name="check" size={10} color="#30A46C" />
              </View>
            )}
            <TouchableOpacity
              style={styles.speakBtn}
              onPress={() => speakWord(item.word, ENGLISH)}
              activeOpacity={0.6}
            >
              <FontAwesome name="volume-up" size={16} color={colors.tint} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.enrichBtn, { backgroundColor: hasEnrich ? colors.border : colors.tint }]}
              onPress={() => enrichWord(item)}
              disabled={isEnriching || batchRunning}
              activeOpacity={0.6}
            >
              {isEnriching ? (
                <ActivityIndicator size="small" color={hasEnrich ? colors.subtitle : '#0D0D0D'} />
              ) : (
                <FontAwesome
                  name={hasEnrich ? 'refresh' : 'magic'}
                  size={13}
                  color={hasEnrich ? colors.subtitle : '#0D0D0D'}
                />
              )}
            </TouchableOpacity>
            <FontAwesome
              name={isExpanded ? 'chevron-up' : 'chevron-down'}
              size={12}
              color={colors.subtitle}
              style={{ marginLeft: 6 }}
            />
          </View>
        </TouchableOpacity>

        {/* Expanded detail */}
        {isExpanded && hasEnrich && (
          <View style={[styles.detailBlock, { borderTopColor: colors.border }]}>
            {item.definitions!.map((d, i) => (
              <View key={i} style={styles.defRow}>
                <Text style={[styles.defPos, { color: colors.tint }]}>
                  {d.pos}.
                </Text>
                <Text style={[styles.defText, { color: colors.subtitle }]}>
                  {d.definition}
                </Text>
              </View>
            ))}
            {item.examples && item.examples.length > 0 && (
              <View style={styles.exBlock}>
                <Text style={[styles.exLabel, { color: colors.pinyin }]}>例句</Text>
                {item.examples.map((ex, i) => (
                  <View key={i} style={styles.exItem}>
                    <Text style={[styles.exText, { color: colors.subtitle }]}>
                      • {ex.en}
                    </Text>
                    {ex.zh ? (
                      <Text style={[styles.exZh, { color: colors.pinyin }]}>
                        {ex.zh}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            )}
            {item.phrases && item.phrases.length > 0 && (
              <View style={styles.exBlock}>
                <Text style={[styles.exLabel, { color: colors.pinyin }]}>相关词</Text>
                {item.phrases.map((p, i) => (
                  <Text key={i} style={[styles.exText, { color: colors.subtitle }]}>
                    • {p.phrase}{p.meaning ? ` (${p.meaning})` : ''}
                  </Text>
                ))}
              </View>
            )}
          </View>
        )}
        {isExpanded && !hasEnrich && (
          <View style={[styles.detailBlock, { borderTopColor: colors.border }]}>
            <Text style={[styles.noEnrich, { color: colors.pinyin }]}>
              暂无详细释义，点击右侧 ✨ 按钮自动补全
            </Text>
          </View>
        )}
      </View>
    );
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: insets.top },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          activeOpacity={0.6}
        >
          <FontAwesome name="chevron-left" size={18} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {name ?? '词本'}
        </Text>
        <View style={styles.headerRight}>
          <Text style={[styles.countText, { color: colors.subtitle }]}>
            {enrichedCount}/{words.length}
          </Text>
        </View>
      </View>

      {/* Batch enrich bar */}
      <View style={[styles.batchBar, { borderColor: colors.border }]}>
        {batchRunning ? (
          <View style={styles.batchProgress}>
            <ActivityIndicator size="small" color={colors.tint} />
            <Text style={[styles.batchText, { color: colors.subtitle }]}>
              补全中 {batchProgress.done}/{batchProgress.total}
            </Text>
            <TouchableOpacity
              onPress={() => { batchCancelRef.current = true; }}
              activeOpacity={0.6}
            >
              <Text style={[styles.batchCancel, { color: '#E5484D' }]}>停止</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            style={[styles.batchBtn, { backgroundColor: colors.tint }]}
            onPress={batchEnrich}
            activeOpacity={0.7}
          >
            <FontAwesome name="magic" size={14} color="#0D0D0D" />
            <Text style={styles.batchBtnText}>
              一键补全缺失释义（{words.length - enrichedCount} 个）
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Word list */}
      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.tint} />
      ) : (
        <FlatList
          data={words}
          keyExtractor={(item) => item.id}
          renderItem={renderWord}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        />
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
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: 20,
    fontWeight: '700',
    marginLeft: 8,
  },
  headerRight: {
    alignItems: 'flex-end',
  },
  countText: {
    fontSize: 13,
    fontWeight: '600',
  },
  batchBar: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  batchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 12,
    paddingVertical: 12,
  },
  batchBtnText: {
    color: '#0D0D0D',
    fontSize: 14,
    fontWeight: '700',
  },
  batchProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    justifyContent: 'center',
  },
  batchText: {
    fontSize: 14,
  },
  batchCancel: {
    fontSize: 14,
    fontWeight: '600',
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 40,
  },
  wordCard: {
    borderRadius: 14,
    marginBottom: 8,
    overflow: 'hidden',
  },
  wordRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  wordMain: {
    flex: 1,
  },
  wordText: {
    fontSize: 17,
    fontWeight: '700',
  },
  wordPhonetic: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 1,
  },
  wordTranslation: {
    fontSize: 13,
    marginTop: 2,
  },
  wordActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  enrichedBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  speakBtn: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  enrichBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailBlock: {
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 14,
  },
  defRow: {
    flexDirection: 'row',
    marginBottom: 5,
    alignItems: 'flex-start',
  },
  defPos: {
    fontSize: 12,
    fontWeight: '700',
    fontStyle: 'italic',
    marginRight: 6,
    minWidth: 32,
  },
  defText: {
    fontSize: 13,
    flex: 1,
    lineHeight: 18,
  },
  exBlock: {
    marginTop: 8,
  },
  exLabel: {
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 3,
  },
  exText: {
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  exItem: {
    marginBottom: 6,
  },
  exZh: {
    fontSize: 12,
    lineHeight: 17,
    marginLeft: 12,
    marginTop: 1,
  },
  noEnrich: {
    fontSize: 13,
    fontStyle: 'italic',
  },
});
