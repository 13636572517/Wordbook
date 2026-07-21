import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  Text,
  Animated,
  Platform,
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
          {word.pronunciation ? (
            <Text style={[styles.pronunciationBack, { color: colors.pinyin }]}>
              {word.pronunciation}
            </Text>
          ) : null}
          <Text style={[styles.wordBack, { color: colors.text }]}>
            {word.word}
          </Text>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <Text style={[styles.translation, { color: colors.tint }]}>
            {word.translation}
          </Text>
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
    height: 300,
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
    fontSize: 36,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 12,
  },
  divider: {
    width: 32,
    height: 1,
    marginBottom: 12,
  },
  translation: {
    fontSize: 22,
    fontWeight: '600',
    textAlign: 'center',
  },
  speakerButton: {
    marginTop: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
