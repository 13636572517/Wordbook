import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  FlatList,
  Alert,
  ActivityIndicator,
  Modal,
  TouchableOpacity,
  Platform,
  Animated,
  PanResponder,
  Keyboard,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StorageAccessFramework } from 'expo-file-system/legacy';
import * as LegacyFS from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import useColors from '@/components/useColors';
import useLanguage from '@/components/useLanguage';
import WordForm from '@/components/WordForm';
import WordCard from '@/components/WordCard';
import {
  getAllWords,
  searchWords,
  deleteWord,
  updateWord,
  Word,
} from '@/lib/database';
import { generatePronunciation } from '@/lib/pronunciation';

const THUMB_MIN_HEIGHT = 40;
const HIDE_DELAY = 1500;

export default function LibraryScreen() {
  const [words, setWords] = useState<Word[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const colors = useColors();
  const { language, refresh: refreshLanguage } = useLanguage();
  const insets = useSafeAreaInsets();

  const [editingWord, setEditingWord] = useState<Word | null>(null);
  const [editWord, setEditWord] = useState('');
  const [editTranslation, setEditTranslation] = useState('');
  const [editPronunciation, setEditPronunciation] = useState('');

  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const showSub = Keyboard.addListener(showEvent, (e) => {
      setKeyboardHeight(e.endCoordinates.height);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setKeyboardHeight(0);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const flatListRef = useRef<FlatList<Word>>(null);
  const contentHeightRef = useRef(0);
  const layoutHeightRef = useRef(0);
  const scrollOffsetRef = useRef(0);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const isDraggingRef = useRef(false);

  const thumbY = useRef(new Animated.Value(0)).current;
  const thumbOpacity = useRef(new Animated.Value(0)).current;
  const [thumbHeight, setThumbHeight] = useState(THUMB_MIN_HEIGHT);

  const calcThumbHeight = useCallback(() => {
    const layout = layoutHeightRef.current;
    const content = contentHeightRef.current;
    if (content <= layout || layout === 0) return 0;
    return Math.max(THUMB_MIN_HEIGHT, layout * (layout / content));
  }, []);

  const showThumb = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    Animated.timing(thumbOpacity, {
      toValue: 1,
      duration: 150,
      useNativeDriver: true,
    }).start();
  }, [thumbOpacity]);

  const scheduleHideThumb = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      Animated.timing(thumbOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }, HIDE_DELAY);
  }, [thumbOpacity]);

  const updateThumbPosition = useCallback((offset: number) => {
    const content = contentHeightRef.current;
    const layout = layoutHeightRef.current;
    if (content <= layout) return;
    const maxScroll = content - layout;
    const h = calcThumbHeight();
    const maxY = layout - h;
    if (maxY <= 0) return;
    const ratio = Math.min(1, Math.max(0, offset / maxScroll));
    thumbY.setValue(ratio * maxY);
  }, [thumbY, calcThumbHeight]);

  const panResponder = useMemo(() => {
    let startThumbY = 0;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        isDraggingRef.current = true;
        showThumb();
        const h = calcThumbHeight();
        const maxY = layoutHeightRef.current - h;
        const maxScroll = contentHeightRef.current - layoutHeightRef.current;
        startThumbY = maxScroll > 0 && maxY > 0
          ? (scrollOffsetRef.current / maxScroll) * maxY
          : 0;
      },
      onPanResponderMove: (_, gestureState) => {
        const h = calcThumbHeight();
        const maxY = layoutHeightRef.current - h;
        if (maxY <= 0) return;
        const newThumbY = Math.min(maxY, Math.max(0, startThumbY + gestureState.dy));
        const ratio = newThumbY / maxY;
        const maxScroll = contentHeightRef.current - layoutHeightRef.current;
        flatListRef.current?.scrollToOffset({ offset: ratio * maxScroll, animated: false });
      },
      onPanResponderRelease: () => {
        isDraggingRef.current = false;
        scheduleHideThumb();
      },
      onPanResponderTerminate: () => {
        isDraggingRef.current = false;
        scheduleHideThumb();
      },
    });
  }, [showThumb, scheduleHideThumb, calcThumbHeight]);

  const handleScroll = useCallback((e: any) => {
    const offset = e.nativeEvent.contentOffset.y;
    scrollOffsetRef.current = offset;
    updateThumbPosition(offset);
    if (!isDraggingRef.current) {
      showThumb();
      scheduleHideThumb();
    }
  }, [updateThumbPosition, showThumb, scheduleHideThumb]);

  const handleContentSizeChange = useCallback((_w: number, h: number) => {
    contentHeightRef.current = h;
    setThumbHeight(calcThumbHeight());
    updateThumbPosition(scrollOffsetRef.current);
  }, [calcThumbHeight, updateThumbPosition]);

  const handleListLayout = useCallback((e: any) => {
    layoutHeightRef.current = e.nativeEvent.layout.height;
    setThumbHeight(calcThumbHeight());
    updateThumbPosition(scrollOffsetRef.current);
  }, [calcThumbHeight, updateThumbPosition]);

  const loadWords = useCallback(async () => {
    setLoading(true);
    const langCode = await refreshLanguage();
    const results = query.trim()
      ? await searchWords(langCode, query.trim())
      : await getAllWords(langCode);
    setWords(results);
    setLoading(false);
  }, [query, refreshLanguage]);

  useFocusEffect(
    useCallback(() => {
      loadWords();
    }, [loadWords])
  );

  const handleDelete = (id: number) => {
    Alert.alert('Delete Word', 'Remove this word from your library?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          if (language) {
            await deleteWord(language.code, id);
            loadWords();
          }
        },
      },
    ]);
  };

  const handleEdit = (word: Word) => {
    setEditingWord(word);
    setEditWord(word.word);
    setEditTranslation(word.translation);
    setEditPronunciation(word.pronunciation);
  };

  const handleSaveEdit = async () => {
    if (!editingWord || !language) return;
    const trimWord = editWord.trim();
    const trimTranslation = editTranslation.trim();
    if (!trimWord || !trimTranslation) {
      Alert.alert('Missing fields', `Please fill in both ${language.nativeName} and translation.`);
      return;
    }
    const finalPronunciation = language.hasPronunciationGuide
      ? editPronunciation || generatePronunciation(trimWord, language.code)
      : '';
    await updateWord(language.code, editingWord.id, trimWord, trimTranslation, finalPronunciation);
    setEditingWord(null);
    loadWords();
  };

  const handleExport = async () => {
    if (!language) return;
    const allWords = await getAllWords(language.code);
    if (allWords.length === 0) {
      Alert.alert('Nothing to export', 'Your library is empty. Add some words first!');
      return;
    }
    const date = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const lines = allWords.map((w) => {
      if (language.hasPronunciationGuide && w.pronunciation) {
        return `${w.word} — ${w.translation} (${w.pronunciation})`;
      }
      return `${w.word} — ${w.translation}`;
    });
    const content = [
      `${language.name} Vocabulary`,
      `Exported: ${date}`,
      `Total: ${allWords.length} word${allWords.length === 1 ? '' : 's'}`,
      '---',
      ...lines,
    ].join('\n');

    const filename = `${language.name.replace(/[^a-zA-Z0-9]/g, '_')}_Vocabulary.txt`;

    if (Platform.OS === 'web') {
      const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } else if (Platform.OS === 'android') {
      const permissions = await StorageAccessFramework.requestDirectoryPermissionsAsync();
      if (!permissions.granted) return;
      const fileUri = await StorageAccessFramework.createFileAsync(
        permissions.directoryUri,
        filename.replace('.txt', ''),
        'text/plain'
      );
      await LegacyFS.writeAsStringAsync(fileUri, content);
      Alert.alert('Exported', `${filename} saved to your selected folder.`);
    } else {
      const tmpPath = LegacyFS.cacheDirectory + filename;
      await LegacyFS.writeAsStringAsync(tmpPath, content);
      await Sharing.shareAsync(tmpPath, {
        mimeType: 'text/plain',
        dialogTitle: `Export ${language.name} Vocabulary`,
      });
    }
  };

  const canSaveEdit =
    editWord.trim().length > 0 && editTranslation.trim().length > 0;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: insets.top },
      ]}
    >
      <View style={styles.titleRow}>
        <View style={styles.titleLeft}>
          <Text style={[styles.screenTitle, { color: colors.text }]}>Library</Text>
          {language && (
            <Text style={[styles.langSubtitle, { color: colors.pinyin }]}>
              {language.flag} {language.nativeName}
            </Text>
          )}
        </View>
        <TouchableOpacity
          onPress={handleExport}
          style={styles.exportButton}
          activeOpacity={0.6}
        >
          <FontAwesome name="share-square-o" size={22} color={colors.tint} />
        </TouchableOpacity>
      </View>

      <View
        style={[
          styles.searchBar,
          {
            backgroundColor: colors.inputBackground,
            borderColor: colors.border,
          },
        ]}
      >
        <FontAwesome name="search" size={14} color={colors.tint} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          value={query}
          onChangeText={setQuery}
          placeholder="Search words..."
          placeholderTextColor={colors.pinyin}
          autoCorrect={false}
        />
        {query.length > 0 && (
          <FontAwesome
            name="times-circle"
            size={16}
            color={colors.subtitle}
            onPress={() => setQuery('')}
          />
        )}
      </View>

      {loading || !language ? (
        <ActivityIndicator
          style={styles.loader}
          size="large"
          color={colors.tint}
        />
      ) : words.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyIcon, { color: colors.subtitle }]}>
            {query.trim() ? '?' : language.flag}
          </Text>
          <Text style={[styles.emptyText, { color: colors.subtitle }]}>
            {query.trim() ? 'No matching words' : 'Your library is empty'}
          </Text>
        </View>
      ) : (
        <View style={styles.listContainer}>
          <FlatList
            ref={flatListRef}
            data={words}
            keyExtractor={(item) => item.id.toString()}
            renderItem={({ item }) => (
              <WordCard
                word={item}
                language={language}
                onDelete={handleDelete}
                onEdit={handleEdit}
                showDelete
              />
            )}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            onScroll={handleScroll}
            onContentSizeChange={handleContentSizeChange}
            onLayout={handleListLayout}
            scrollEventThrottle={16}
          />
          {thumbHeight > 0 && (
            <Animated.View
              style={[styles.scrollTrack, { opacity: thumbOpacity }]}
              pointerEvents="box-none"
            >
              <Animated.View
                style={[
                  styles.scrollThumbHitArea,
                  {
                    height: thumbHeight,
                    transform: [{ translateY: thumbY }],
                  },
                ]}
                {...panResponder.panHandlers}
              >
                <View
                  style={[
                    styles.scrollThumbVisible,
                    { backgroundColor: colors.subtitle },
                  ]}
                />
              </Animated.View>
            </Animated.View>
          )}
        </View>
      )}

      <Modal
        visible={editingWord !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setEditingWord(null)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalContent,
              {
                backgroundColor: colors.background,
                paddingBottom: keyboardHeight > 0 ? keyboardHeight : 40,
              },
            ]}
          >
            <View style={styles.modalHeader}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>
                Edit Word
              </Text>
              <TouchableOpacity
                onPress={() => setEditingWord(null)}
                style={styles.modalClose}
                activeOpacity={0.6}
              >
                <FontAwesome name="times" size={22} color={colors.subtitle} />
              </TouchableOpacity>
            </View>

            {language && (
              <WordForm
                language={language}
                wordText={editWord}
                onWordTextChange={setEditWord}
                translation={editTranslation}
                onTranslationChange={setEditTranslation}
                pronunciation={editPronunciation}
                onPronunciationChange={setEditPronunciation}
              />
            )}

            <TouchableOpacity
              style={[
                styles.saveButton,
                {
                  backgroundColor: colors.tint,
                  opacity: canSaveEdit ? 1 : 0.35,
                },
              ]}
              onPress={handleSaveEdit}
              disabled={!canSaveEdit}
              activeOpacity={0.7}
            >
              <FontAwesome name="check" size={16} color="#0D0D0D" />
              <Text style={styles.saveText}>Save Changes</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  titleLeft: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 10,
    flexShrink: 1,
  },
  exportButton: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  langSubtitle: {
    fontSize: 14,
    letterSpacing: 0.3,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 12,
    fontSize: 15,
  },
  list: {
    paddingBottom: 20,
  },
  listContainer: {
    flex: 1,
  },
  scrollTrack: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    width: 24,
    alignItems: 'flex-end',
  },
  scrollThumbHitArea: {
    width: 24,
    alignItems: 'flex-end',
    paddingRight: 2,
  },
  scrollThumbVisible: {
    width: 4,
    flex: 1,
    borderRadius: 2,
    opacity: 0.4,
  },
  loader: {
    marginTop: 40,
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
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 20,
    paddingBottom: 8,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  modalClose: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 28,
    paddingVertical: 16,
    borderRadius: 14,
  },
  saveText: {
    color: '#0D0D0D',
    fontSize: 17,
    fontWeight: '700',
  },
});
