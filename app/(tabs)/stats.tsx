import React, { useState } from 'react';
import { StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import useColors from '@/components/useColors';
import useLanguage from '@/components/useLanguage';
import { getStats, getStreak, StudyStats, StreakData } from '@/lib/database';

export default function StatsScreen() {
  const [stats, setStats] = useState<StudyStats | null>(null);
  const [streak, setStreak] = useState<StreakData | null>(null);
  const [loading, setLoading] = useState(true);
  const colors = useColors();
  const { language, refresh } = useLanguage();
  const insets = useSafeAreaInsets();

  useFocusEffect(
    React.useCallback(() => {
      let cancelled = false;
      (async () => {
        const code = await refresh();
        if (cancelled) return;
        const [s, st] = await Promise.all([getStats(code), getStreak()]);
        if (cancelled) return;
        setStats(s);
        setStreak(st);
        setLoading(false);
      })();
      return () => {
        cancelled = true;
      };
    }, [refresh])
  );

  if (loading || !stats || !language) {
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
      <Text style={[styles.heading, { color: colors.text }]}>统计</Text>

      <View style={[styles.streakCard, { backgroundColor: colors.card }]}>
        <FontAwesome name="fire" size={28} color={colors.tint} />
        <View style={styles.streakText}>
          <Text style={[styles.streakNum, { color: colors.text }]}>
            {streak?.streak ?? 0} 天
          </Text>
          <Text style={[styles.streakLabel, { color: colors.subtitle }]}>
            连续学习
          </Text>
        </View>
      </View>

      <View style={styles.grid}>
        <BigStat label="总词数" value={stats.total} color="#E8E0D4" icon="book" />
        <BigStat label="待复习" value={stats.due} color="#F5A623" icon="clock-o" />
        <BigStat label="新词" value={stats.newCount} color="#A78BFA" icon="plus" />
        <BigStat label="已掌握" value={stats.mastered} color="#30A46C" icon="star" />
      </View>

      <View style={[styles.accuracyCard, { backgroundColor: colors.card }]}>
        <View style={styles.accuracyTop}>
          <Text style={[styles.accuracyLabel, { color: colors.subtitle }]}>
            答题正确率
          </Text>
          <Text style={[styles.accuracyValue, { color: '#3B82F6' }]}>
            {Math.round(stats.accuracy * 100)}%
          </Text>
        </View>
        <View style={styles.barBg}>
          <View
            style={[
              styles.barFill,
              { width: `${Math.round(stats.accuracy * 100)}%` },
            ]}
          />
        </View>
        <Text style={[styles.accDetail, { color: colors.subtitle }]}>
          正确 {stats.correct} · 错误 {stats.wrong}
        </Text>
      </View>

      <Text style={[styles.note, { color: colors.subtitle }]}>
        复习采用 SM-2 间隔重复算法：选 Good/Easy 间隔变长，选 Again 会很快再次出现。
      </Text>
    </View>
  );
}

function BigStat({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: number;
  color: string;
  icon: React.ComponentProps<typeof FontAwesome>['name'];
}) {
  const colors = useColors();
  return (
    <View style={[styles.statBox, { backgroundColor: colors.card }]}>
      <FontAwesome name={icon} size={16} color={color} />
      <Text style={[styles.statValue, { color: '#E8E0D4' }]}>{value}</Text>
      <Text style={[styles.statLabel, { color: colors.subtitle }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  heading: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
    paddingVertical: 16,
  },
  streakCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
    gap: 16,
  },
  streakText: {
    flexDirection: 'column',
  },
  streakNum: {
    fontSize: 26,
    fontWeight: '800',
  },
  streakLabel: {
    fontSize: 13,
    marginTop: 2,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginBottom: 14,
  },
  statBox: {
    width: '47%',
    borderRadius: 14,
    padding: 16,
  },
  statValue: {
    fontSize: 30,
    fontWeight: '800',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 13,
    marginTop: 2,
  },
  accuracyCard: {
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
  },
  accuracyTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  accuracyLabel: {
    fontSize: 14,
  },
  accuracyValue: {
    fontSize: 22,
    fontWeight: '800',
  },
  barBg: {
    height: 10,
    backgroundColor: '#2A2520',
    borderRadius: 5,
    marginTop: 12,
    overflow: 'hidden',
  },
  barFill: {
    height: 10,
    backgroundColor: '#3B82F6',
    borderRadius: 5,
  },
  accDetail: {
    fontSize: 13,
    marginTop: 10,
  },
  note: {
    fontSize: 13,
    lineHeight: 20,
  },
});
