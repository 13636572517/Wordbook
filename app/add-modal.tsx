import React, { useState } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  Text,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { router } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useColors from '@/components/useColors';
import WordForm from '@/components/WordForm';
import { repo } from '@/lib/data';
import type { Word } from '@/lib/data';
import { lookupIpa } from '@/lib/ipaData';
import { getLanguageByCode } from '@/lib/languages';
import { useSession } from '@/components/SessionProvider';

const ENGLISH = getLanguageByCode('en');

export default function AddModal() {
  const [wordText, setWordText] = useState('');
  const [translation, setTranslation] = useState('');
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { wordbook } = useSession();

  const canSave = wordText.trim().length > 0 && translation.trim().length > 0;

  const handleSave = async () => {
    if (!wordbook) return;
    const trimmedWord = wordText.trim();
    const trimmedTranslation = translation.trim();
    if (!trimmedWord || !trimmedTranslation) {
      Alert.alert('Missing fields', 'Please enter both word and translation.');
      return;
    }
    const w: Word = {
      id: `w_${trimmedWord.toLowerCase()}`,
      word: trimmedWord,
      translation: trimmedTranslation,
      pronunciation: lookupIpa(trimmedWord) ?? null,
    };
    await repo.upsertWord(w);
    await repo.addWordToWordbook(wordbook.id, w.id);
    setWordText('');
    setTranslation('');
    Alert.alert('Saved!', `"${trimmedWord}" added to 「${wordbook.name}」.`, [
      { text: 'Add Another', style: 'default' },
      { text: 'Done', style: 'cancel', onPress: () => router.back() },
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
          Add Word{wordbook ? ` · ${wordbook.name}` : ''}
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
          onWordTextChange={setWordText}
          translation={translation}
          onTranslationChange={setTranslation}
          pronunciation=""
          onPronunciationChange={() => {}}
        />

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
          <Text style={styles.saveText}>Save Word</Text>
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
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 36,
    paddingVertical: 16,
    borderRadius: 14,
  },
  saveText: {
    color: '#0D0D0D',
    fontSize: 17,
    fontWeight: '700',
  },
});
