import { useSession } from '@/components/SessionProvider';
import useColors from '@/components/useColors';
import WordForm from '@/components/WordForm';
import type { Word, WordDefinition, WordExample, WordPhrase } from '@/lib/data';
import { repo } from '@/lib/data';
import { formatChineseSummary, lookupWord, type DictionaryResult } from '@/lib/dictionary';
import { lookupIpa } from '@/lib/ipaData';
import { getLanguageByCode } from '@/lib/languages';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { router } from 'expo-router';
import React, { useCallback, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Alert,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const ENGLISH = getLanguageByCode('en');

export default function AddModal() {
  const [wordText, setWordText] = useState('');
  const [translation, setTranslation] = useState('');
  const [looking, setLooking] = useState(false);
  const [dictResult, setDictResult] = useState<DictionaryResult | null>(null);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { wordbook } = useSession();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const canSave = wordText.trim().length > 0 && translation.trim().length > 0;

  // Auto-lookup when user stops typing (debounced 800ms)
  const handleWordChange = useCallback((text: string) => {
    setWordText(text);
    setDictResult(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = text.trim();
    if (trimmed.length >= 2 && /^[a-zA-Z\s'-]+$/.test(trimmed)) {
      debounceRef.current = setTimeout(async () => {
        setLooking(true);
        const result = await lookupWord(trimmed);
        setLooking(false);
        if (result) {
          setDictResult(result);
          // Auto-fill translation if empty
          setTranslation((prev) => {
            if (prev.trim()) return prev;
            const summary = formatChineseSummary(result);
            return summary || prev;
          });
        }
      }, 800);
    }
  }, []);

  const handleSave = async () => {
    if (!wordbook) return;
    const trimmedWord = wordText.trim();
    const trimmedTranslation = translation.trim();
    if (!trimmedWord || !trimmedTranslation) {
      Alert.alert('缺少字段', '请输入单词和释义。');
      return;
    }
    const w: Word = {
      id: `w_${trimmedWord.toLowerCase().replace(/\s+/g, '_')}`,
      word: trimmedWord,
      translation: trimmedTranslation,
      pronunciation: dictResult?.phonetic ?? lookupIpa(trimmedWord) ?? null,
      phonetic: dictResult?.phonetic,
      definitions: dictResult?.definitions as WordDefinition[] | undefined,
      examples: dictResult?.examples as WordExample[] | undefined,
      phrases: dictResult?.phrases as WordPhrase[] | undefined,
      audioUrl: dictResult?.audioUrl,
    };
    await repo.upsertWord(w);
    await repo.addWordToWordbook(wordbook.id, w.id);
    setWordText('');
    setTranslation('');
    setDictResult(null);
    Alert.alert('已保存！', `“${trimmedWord}” 已添加到「${wordbook.name}」`, [
      { text: '继续添加', style: 'default' },
      { text: '完成', style: 'cancel', onPress: () => router.back() },
    ]);
  };

  return (
    <KeyboardAvoidingView
      style={[styles.wrapper, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={[styles.dragHandleRow, { paddingTop: insets.top + 8 }]}>
        <View style={[styles.dragHandle, { backgroundColor: colors.border }]} />
      </View>

      <View style={styles.headerRow}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          添加单词{wordbook ? ` · ${wordbook.name}` : ''}
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          style={styles.closeButton}
          activeOpacity={0.6}
        >
          <FontAwesome name="times" size={22} color={colors.subtitle} />
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={styles.form}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <WordForm
          language={ENGLISH}
          wordText={wordText}
          onWordTextChange={handleWordChange}
          translation={translation}
          onTranslationChange={setTranslation}
          pronunciation=""
          onPronunciationChange={() => {}}
        />

        {/* Dictionary lookup status */}
        {looking && (
          <View style={styles.lookupStatus}>
            <ActivityIndicator size="small" color={colors.tint} />
            <Text style={[styles.lookupText, { color: colors.subtitle }]}>
              正在查询词典…
            </Text>
          </View>
        )}
        {dictResult && !looking && (
          <View style={[styles.dictCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.dictHeader}>
              <FontAwesome name="book" size={14} color={colors.tint} />
              <Text style={[styles.dictTitle, { color: colors.tint }]}>
                词典结果
              </Text>
              {dictResult.phonetic && (
                <Text style={[styles.dictPhonetic, { color: colors.pinyin }]}>
                  {dictResult.phonetic}
                </Text>
              )}
            </View>
            {dictResult.definitions.slice(0, 3).map((d, i) => (
              <Text key={i} style={[styles.dictDef, { color: colors.subtitle }]}>
                {d.pos}. {d.definition}
              </Text>
            ))}
            {dictResult.examples.length > 0 && (
              <Text style={[styles.dictExample, { color: colors.pinyin }]}>
                e.g. {dictResult.examples[0].en}
              </Text>
            )}
          </View>
        )}

        <TouchableOpacity
          style={[
            styles.saveButton,
            { backgroundColor: colors.tint, opacity: canSave ? 1 : 0.35 },
          ]}
          onPress={handleSave}
          disabled={!canSave}
          activeOpacity={0.7}
        >
          <FontAwesome name="check" size={16} color="#0D0D0D" />
          <Text style={styles.saveText}>保存单词</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  dragHandleRow: {
    alignItems: 'center',
    paddingBottom: 4,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  form: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  lookupStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingHorizontal: 4,
  },
  lookupText: {
    fontSize: 13,
  },
  dictCard: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  dictHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  dictTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  dictPhonetic: {
    fontSize: 13,
    fontStyle: 'italic',
    marginLeft: 'auto',
  },
  dictDef: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 4,
  },
  dictExample: {
    fontSize: 13,
    fontStyle: 'italic',
    marginTop: 6,
    lineHeight: 18,
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
    paddingVertical: 16,
    borderRadius: 14,
  },
  saveText: {
    color: '#0D0D0D',
    fontSize: 17,
    fontWeight: '700',
  },
});
