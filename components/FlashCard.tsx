import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  Text,
  Animated,
  Platform,
  ScrollView,
} from 'react-native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import useColors from './useColors';
import type { Word } from '@/lib/data';
import { speakWord } from '@/lib/speech';
import { LanguageConfig } from '@/lib/languages';

type Props = {
  word: Word;
  language: LanguageConfig;
  onFlip?: (isFlipped: boolean) => void;
};

export default function FlashCard({ word, language, onFlip }: Props) {
  const [isFlipped, setIsFlipped] = useState(false);
  const flipAnim = useRef(new Animated.Value(0)).current;
  const colors = useColors();

  const flipCard = () => {
    const toValue = isFlipped ? 0 : 1;
    Animated.spring(flipAnim, {
      toValue,
      friction: 8,
      tension: 10,
      useNativeDriver: true,
    }).start();
    const newFlipped = !isFlipped;
    setIsFlipped(newFlipped);
    onFlip?.(newFlipped);
  };

  const frontInterpolate = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });
  const backInterpolate = flipAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['180deg', '360deg'],
  });
  const frontOpacity = flipAnim.interpolate({
    inputRange: [0, 0.5, 0.5, 1],
    outputRange: [1, 1, 0, 0],
  });
  const backOpacity = flipAnim.interpolate({
    inputRange: [0, 0.5, 0.5, 1],
    outputRange: [0, 0, 1, 1],
  });

  const cardShadow = Platform.select({
    ios: {
      shadowColor: colors.shadow,
      shadowOffset: { width: 0, height: 8 },
      shadowOpacity: 0.4,
      shadowRadius: 16,
    },
    android: { elevation: 8 },
    default: {},
  });

  return (
    <View style={styles.container}>
      <TouchableOpacity
        activeOpacity={0.95}
        onPress={flipCard}
        style={styles.cardWrapper}
      >
        <Animated.View
          style={[
            styles.card,
            { backgroundColor: colors.card, ...cardShadow },
            {
              transform: [{ rotateY: frontInterpolate }],
              opacity: frontOpacity,
            },
          ]}
        >
          <Text style={[styles.wordFront, { color: colors.text }]}>
            {word.word}
          </Text>
        </Animated.View>

        <Animated.View
          style={[
            styles.card,
            styles.cardBack,
            { backgroundColor: colors.card, ...cardShadow },
            {
              transform: [{ rotateY: backInterpolate }],
              opacity: backOpacity,
            },
          ]}
        >
          <ScrollView
            contentContainerStyle={styles.backContent}
            showsVerticalScrollIndicator={false}
          >
            {(word.phonetic || word.pronunciation) ? (
              <Text style={[styles.pronunciationBack, { color: colors.pinyin }]}>
                {word.phonetic || word.pronunciation}
              </Text>
            ) : null}
            <Text style={[styles.wordBack, { color: colors.text }]}>
              {word.word}
            </Text>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <Text style={[styles.translation, { color: colors.tint }]}>
              {word.translation}
            </Text>

            {/* Definitions by part of speech */}
            {word.definitions && word.definitions.length > 0 && (
              <View style={styles.definitionsBlock}>
                {word.definitions.map((d, i) => (
                  <View key={i} style={styles.defRow}>
                    <Text style={[styles.defPos, { color: colors.pinyin }]}>
                      {d.pos}.
                    </Text>
                    <Text style={[styles.defText, { color: colors.subtitle }]}>
                      {d.definition}
                    </Text>
                  </View>
                ))}
              </View>
            )}

            {/* Example sentences */}
            {word.examples && word.examples.length > 0 && (
              <View style={styles.examplesBlock}>
                <Text style={[styles.sectionLabel, { color: colors.pinyin }]}>
                  例句
                </Text>
                {word.examples.map((ex, i) => (
                  <View key={i} style={styles.exampleItem}>
                    <Text style={[styles.exampleText, { color: colors.subtitle }]}>
                      {ex.en}
                    </Text>
                    {ex.zh ? (
                      <Text style={[styles.exampleZh, { color: colors.pinyin }]}>
                        {ex.zh}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            )}

            {/* Phrases / Collocations */}
            {word.phrases && word.phrases.length > 0 && (
              <View style={styles.phrasesBlock}>
                <Text style={[styles.sectionLabel, { color: colors.pinyin }]}>
                  相关词组
                </Text>
                {word.phrases.map((p, i) => (
                  <Text key={i} style={[styles.phraseText, { color: colors.subtitle }]}>
                    {p.phrase}
                    {p.meaning ? ` — ${p.meaning}` : ''}
                  </Text>
                ))}
              </View>
            )}
          </ScrollView>
        </Animated.View>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={() => speakWord(word.word, language)}
        style={[styles.speakerButton, { backgroundColor: colors.border }]}
        activeOpacity={0.6}
      >
        <FontAwesome name="volume-up" size={22} color={colors.tint} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  cardWrapper: {
    width: '100%',
    height: 340,
  },
  card: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
    backfaceVisibility: 'hidden',
  },
  cardBack: {
    position: 'absolute',
    top: 0,
    justifyContent: 'flex-start',
    paddingTop: 24,
  },
  backContent: {
    alignItems: 'center',
    paddingBottom: 16,
  },
  wordFront: {
    fontSize: 48,
    fontWeight: '700',
    textAlign: 'center',
  },
  pronunciationBack: {
    fontSize: 15,
    letterSpacing: 0.5,
    marginBottom: 6,
    fontStyle: 'italic',
  },
  wordBack: {
    fontSize: 32,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  divider: {
    width: 32,
    height: 1,
    marginBottom: 8,
  },
  translation: {
    fontSize: 20,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 12,
  },
  definitionsBlock: {
    width: '100%',
    marginTop: 4,
  },
  defRow: {
    flexDirection: 'row',
    marginBottom: 6,
    alignItems: 'flex-start',
  },
  defPos: {
    fontSize: 13,
    fontWeight: '700',
    fontStyle: 'italic',
    marginRight: 6,
    minWidth: 36,
  },
  defText: {
    fontSize: 14,
    flex: 1,
    lineHeight: 20,
  },
  examplesBlock: {
    width: '100%',
    marginTop: 10,
  },
  sectionLabel: {
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  exampleText: {
    fontSize: 13,
    fontStyle: 'italic',
    lineHeight: 19,
  },
  exampleItem: {
    marginBottom: 6,
  },
  exampleZh: {
    fontSize: 12,
    lineHeight: 17,
    marginTop: 1,
  },
  phrasesBlock: {
    width: '100%',
    marginTop: 10,
  },
  phraseText: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 3,
  },
  speakerButton: {
    marginTop: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
