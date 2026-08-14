import type { Word } from '@/lib/data';
import { LanguageConfig } from '@/lib/languages';
import { speakWord } from '@/lib/speech';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useRef, useState } from 'react';
import {
    Animated,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    useWindowDimensions,
    View,
} from 'react-native';
import useColors from './useColors';

type Props = {
  word: Word;
  language: LanguageConfig;
  onFlip?: (isFlipped: boolean) => void;
};

export default function FlashCard({ word, language, onFlip }: Props) {
  const [isFlipped, setIsFlipped] = useState(false);
  const flipAnim = useRef(new Animated.Value(0)).current;
  const colors = useColors();
  const { height: winHeight } = useWindowDimensions();
  // 卡片高度随屏幕自适应，小屏不被评分按钮挤压
  const cardHeight = Math.min(340, Math.round(winHeight * 0.45));

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

  const handleFrontPress = () => {
    // Web Speech / 音频回退必须由用户手势同步触发，避免浏览器拦截播放。
    speakWord(word.word, language);
    flipCard();
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
      <View style={[styles.cardWrapper, { height: cardHeight }]}>
        {/* 正面：整卡点击翻面；翻面后禁用，避免与背面滚动冲突 */}
        <TouchableOpacity
          activeOpacity={0.95}
          onPress={handleFrontPress}
          disabled={isFlipped}
          style={[styles.card, { pointerEvents: isFlipped ? 'none' : 'auto' }]}
        >
          <Animated.View
            style={[
              styles.cardFace,
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
        </TouchableOpacity>

        {/* 背面：内容可滚动，仅通过底部按钮翻回，滚动不会误触发翻面 */}
        <Animated.View
          pointerEvents={isFlipped ? 'auto' : 'none'}
          style={[
            styles.cardFace,
            styles.cardBack,
            { backgroundColor: colors.card, ...cardShadow },
            {
              transform: [{ rotateY: backInterpolate }],
              opacity: backOpacity,
            },
          ]}
        >
          <ScrollView
            style={styles.backScroll}
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
                      {d.pos.toLowerCase()}.
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
          <TouchableOpacity
            style={[styles.flipBackBtn, { backgroundColor: colors.background }]}
            onPress={flipCard}
            activeOpacity={0.7}
          >
            <FontAwesome name="rotate-left" size={13} color={colors.subtitle} />
            <Text style={[styles.flipBackText, { color: colors.subtitle }]}>点击返回正面</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>

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
  },
  card: {
    position: 'absolute',
    width: '100%',
    height: '100%',
  },
  cardFace: {
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
    top: 0,
    justifyContent: 'flex-start',
    paddingTop: 24,
    paddingBottom: 12,
  },
  backScroll: {
    width: '100%',
    flex: 1,
  },
  backContent: {
    alignItems: 'center',
    paddingBottom: 8,
  },
  flipBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    alignSelf: 'center',
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 14,
    marginTop: 6,
  },
  flipBackText: {
    fontSize: 12,
    fontWeight: '600',
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
