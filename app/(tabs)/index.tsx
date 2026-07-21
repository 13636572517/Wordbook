import React, { useState, useCallback, useRef } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  Text,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useColors from '@/components/useColors';
import useLanguage from '@/components/useLanguage';
import {
  getQuizWord,
  reviewWord,
  getWordCount,
  getStats,
  getStreak,
  Word,
  Grade,
  StudyStats,
  StreakData,
} from '@/lib/database';
import FlashCard from '@/components/FlashCard';

const GRADES: { grade: Grade; label: string; color: string }[] = [
  { grade: 0, label: 'Again', color: '#E5484D' },
  { grade: 1, label: 'Hard', color: '#F5A623' },
  { grade: 2, label: 'Good', color: '#30A46C' },
  { grade: 3, label: 'Easy', color: '#3B82F6' },
];

export default function HomeScreen() {
  const [word, setWord] = useState<Word | null>(null);
  const [isFlipped, setIsFlipped] = useState(false);
  const [count, setCount] = useState(0);
  const [stats, setStats] = useState<StudyStats | null>(null);
  const [streak, setStreak] = useState<StreakData | null>(null);
  const [loading, setLoading] = useState(true);
  const [cardKey, setCardKey] = useState(0);
  const colors = useColors();
  const { language, refresh: refreshLanguage } = useLanguage();
  const insets = useSafeAreaInsets();
  const activeLangRef = useRef<string | null>(null);
  const hasWordRef = useRef(false);

  const loadNext = useCallback(async (langCode: string) => {
    const [w, c, s, st] = await Promise.all([
      getQuizWord(langCode),
      getWordCount(langCode),
      getStats(langCode),
      getStreak(),
    ]);
    setWord(w);
    hasWordRef.current = w != null;
    setCount(c);
    setStats(s);
    setStreak(st);
    setIsFlipped(false);
    setCardKey((k) => k + 1);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        const langCode = await refreshLanguage();
        if (cancelled) return;

        const langChanged = activeLangRef.current !== langCode;
        activeLangRef.current = langCode;

        if (langChanged || !hasWordRef.current) {
          setLoading(true);
          await loadNext(langCode);
        } else {
          const c = await getWordCount(langCode);
          if (!cancelled) setCount(c);
          setLoading(false);
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [refreshLanguage, loadNext])
  );

  const handleGrade = async (grade: Grade) => {
    if (word && language) {
      await reviewWord(language.code, word.id, grade);
      loadNext(language.code);
    }
  };

  if (loading || !language) {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: colors.background, paddingTop: insets.top },
        ]}
      >
        <ActivityIndicator size="large" color={colors.tint} />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: insets.top },
      ]}
    >
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: colors.text }]}>Vocab</Text>
          {count > 0 && (
            <Text style={[styles.countBadge, { color: colors.pinyin }]}>
              {count} words
            </Text>
          )}
        </View>
        <View style={styles.headerButtons}>
          <TouchableOpacity
            style={[styles.langButton, { borderColor: colors.tint }]}
            onPress={() => router.push('/language-modal')}
            activeOpacity={0.7}
          >
            <Text style={styles.langFlag}>{language.flag}</Text>
            <Text style={[styles.langLabel, { color: colors.tint }]}>
              {language.nativeName}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: colors.tint }]}
            onPress={() => router.push('/add-modal')}
            activeOpacity={0.7}
          >
            <FontAwesome name="plus" size={18} color="#0D0D0D" />
          </TouchableOpacity>
        </View>
      </View>

      {stats && (
        <View style={styles.statsRow}>
          <StatChip
            icon="fire"
            value={String(streak?.streak ?? 0)}
            label="天连续"
            color={colors.tint}
          />
          <StatChip
            icon="clock-o"
            value={String(stats.due)}
            label="待复习"
            color="#F5A623"
          />
          <StatChip
            icon="star"
            value={String(stats.mastered)}
            label="已掌握"
            color="#30A46C"
          />
          <StatChip
            icon="percent"
            value={`${Math.round(stats.accuracy * 100)}%`}
            label="正确率"
            color="#3B82F6"
          />
        </View>
      )}

      {!word ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyIcon, { color: colors.subtitle }]}>🎉</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            All caught up!
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.subtitle }]}>
            没有待复习的词了，明天再来看看～
          </Text>
          <TouchableOpacity
            style={[styles.emptyAddButton, { backgroundColor: colors.tint }]}
            onPress={() => router.push('/add-modal')}
            activeOpacity={0.7}
          >
            <FontAwesome name="plus" size={16} color="#0D0D0D" />
            <Text style={styles.emptyAddText}>Add a word</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.cardArea}>
          <FlashCard
            key={cardKey}
            word={word}
            language={language}
            onFlip={setIsFlipped}
          />

          {isFlipped ? (
            <View style={styles.gradeRow}>
              {GRADES.map((g) => (
                <TouchableOpacity
                  key={g.grade}
                  style={[styles.gradeButton, { backgroundColor: g.color }]}
                  onPress={() => handleGrade(g.grade)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.gradeText}>{g.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : (
            <Text style={[styles.hint, { color: colors.pinyin }]}>
              Tap the card to reveal
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

function StatChip({
  icon,
  value,
  label,
  color,
}: {
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  value: string;
  label: string;
  color: string;
}) {
  return (
    <View style={styles.chip}>
      <FontAwesome name={icon} size={14} color={color} />
      <Text style={[styles.chipValue, { color: '#E8E0D4' }]}>{value}</Text>
      <Text style={styles.chipLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  countBadge: {
    fontSize: 12,
    marginTop: 2,
    letterSpacing: 0.3,
  },
  headerButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  langButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  langFlag: {
    fontSize: 18,
  },
  langLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  chip: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#1A1814',
    borderRadius: 12,
    paddingVertical: 10,
    marginHorizontal: 4,
  },
  chipValue: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 2,
  },
  chipLabel: {
    fontSize: 11,
    color: '#9C9486',
    marginTop: 1,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 60,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptySubtitle: {
    fontSize: 15,
    marginBottom: 28,
    textAlign: 'center',
  },
  emptyAddButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
  },
  emptyAddText: {
    color: '#0D0D0D',
    fontSize: 16,
    fontWeight: '600',
  },
  cardArea: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingBottom: 40,
  },
  gradeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 18,
    width: '100%',
  },
  gradeButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 12,
  },
  gradeText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  hint: {
    marginTop: 22,
    fontSize: 13,
    letterSpacing: 0.3,
  },
});
