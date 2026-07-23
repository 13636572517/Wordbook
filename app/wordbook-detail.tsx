import EnrichModal from '@/components/EnrichModal';
import { useSession } from '@/components/SessionProvider';
import useColors from '@/components/useColors';
import type { Word } from '@/lib/data';
import { repo } from '@/lib/data';
import { lookupWord } from '@/lib/dictionary';
import { getLanguageByCode } from '@/lib/languages';
import { speakWord } from '@/lib/speech';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFocusEffect } from '@react-navigation/native';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    FlatList,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ENGLISH = getLanguageByCode('en');
const USE_CLOUD = process.env.EXPO_PUBLIC_USE_CLOUD === 'true';

/** 桌面网页版检测（排除手机 PWA / 小屏） */
function isDesktopWeb(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  if (window.matchMedia?.('(display-mode: standalone)').matches) return false;
  return window.innerWidth >= 768;
}

export default function WordbookDetailScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name: string }>();
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { isAdmin, user, wordbooks, refreshBooks } = useSession();
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(true);
  const [enrichingId, setEnrichingId] = useState<string | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [enrichModalVisible, setEnrichModalVisible] = useState(false);
  const batchCancelRef = useRef(false);

  // 云端模式：服务器端补全仅在桌面网页版 + 管理员可用
  const showCloudEnrich = USE_CLOUD && isAdmin && isDesktopWeb();

  const loadWords = useCallback(async () => {
    if (!id) return;
    // 云端模式：详情页需要完整释义数据
    const ws = USE_CLOUD
      ? await (await import('@/lib/data/httpRepo')).fetchWordbookWordsFull(id)
      : await repo.getWordsByWordbook(id);
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

  // 仅自定义词本 + 当前用户为所有者或管理员时，显示逐词删除按钮
  const currentBook = wordbooks.find((w) => w.id === id);
  const canManage = !!currentBook && currentBook.type === 'custom' &&
    (isAdmin || currentBook.ownerId === user?.id);

  // 删除单个单词（管理员/所有者）
  const deleteWord = (word: Word) => {
    Alert.alert(
      '删除单词',
      `确定将「${word.word}」从「${name}」中移除吗？`,
      [
        { text: '取消', style: 'cancel' },
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              await repo.removeWordFromWordbook(id as string, word.id);
              setWords((prev) => prev.filter((w) => w.id !== word.id));
              // 同步刷新会话词本计数，返回词本列表时显示最新单词数
              await refreshBooks();
            } catch (e: any) {
              Alert.alert('删除失败', e?.message || '请稍后重试');
            }
          },
        },
      ],
    );
  };

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
            {/* 单词补全按钮：云端模式由服务器端批量补全，不显示客户端按钮 */}
            {!USE_CLOUD && (
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
            )}
            {canManage && (
              <TouchableOpacity
                style={styles.delWordBtn}
                onPress={() => deleteWord(item)}
                activeOpacity={0.6}
              >
                <FontAwesome name="trash" size={15} color="#E5484D" />
              </TouchableOpacity>
            )}
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
                  {d.pos.toLowerCase()}.
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
              {USE_CLOUD
                ? '暂无详细释义，管理员可通过顶部“一键补全释义”批量补全'
                : '暂无详细释义，点击右侧 ✨ 按钮自动补全'}
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
          onPress={() => {
            if (router.canGoBack()) router.back();
            else router.replace('/(tabs)/library');
          }}
          activeOpacity={0.6}
        >
          <FontAwesome name="chevron-left" size={18} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {name ?? '词本'}
        </Text>
        <TouchableOpacity
          style={styles.headerAdd}
          onPress={() => router.push({ pathname: '/add-modal', params: { wordbookId: id, name } })}
          activeOpacity={0.6}
        >
          <FontAwesome name="plus" size={18} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerRight}>
          <Text style={[styles.countText, { color: colors.subtitle }]}>
            {enrichedCount}/{words.length}
          </Text>
        </View>
      </View>

      {/* Batch enrich bar */}
      {showCloudEnrich ? (
        /* 云端模式：服务器端补全（弹窗展示进度） */
        <View style={[styles.batchBar, { borderColor: colors.border }]}>
          <TouchableOpacity
            style={[styles.batchBtn, { backgroundColor: colors.tint }]}
            onPress={() => setEnrichModalVisible(true)}
            activeOpacity={0.7}
          >
            <FontAwesome name="magic" size={14} color="#0D0D0D" />
            <Text style={styles.batchBtnText}>
              一键补全释义（服务器端）
            </Text>
          </TouchableOpacity>
        </View>
      ) : !USE_CLOUD ? (
        /* 本地模式：客户端补全 */
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
      ) : null}
      {/* 云端补全进度弹窗 */}
      {showCloudEnrich && (
        <EnrichModal
          visible={enrichModalVisible}
          onClose={() => setEnrichModalVisible(false)}
          onFinished={() => loadWords()}
        />
      )}

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
  headerAdd: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
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
  delWordBtn: {
    width: 30,
    height: 30,
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
