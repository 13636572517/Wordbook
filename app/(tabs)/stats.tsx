import React, { useState } from 'react';
import { StyleSheet, View, Text, ActivityIndicator, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import useColors from '@/components/useColors';
import { repo } from '@/lib/data';
import { getWordbookStats, getTodayStats, type WordbookStats, type TodayStats } from '@/lib/data/stats';
import { useSession } from '@/components/SessionProvider';

export default function StatsScreen() {
  const [stats, setStats] = useState<WordbookStats | null>(null);
  const [today, setToday] = useState<TodayStats | null>(null);
  const [loading, setLoading] = useState(true);
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, wordbook, isAdmin, isTeacher } = useSession();
  const router = useRouter();

  useFocusEffect(
    React.useCallback(() => {
      let cancelled = false;
      (async () => {
        if (!user || !wordbook) return;
        const [s, t] = await Promise.all([
          getWordbookStats(repo, user.id, wordbook.id, Date.now()),
          getTodayStats(repo, user.id, wordbook.id, Date.now()),
        ]);
        if (cancelled) return;
        setStats(s);
        setToday(t);
        setLoading(false);
      })();
      return () => {
        cancelled = true;
      };
    }, [user, wordbook]),
  );

  if (loading || !stats || !wordbook) {
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
      <Text style={[styles.heading, { color: colors.text }]}>
        {wordbook.name} · 统计
      </Text>

      {(isAdmin || isTeacher) && (
        <TouchableOpacity
          style={[styles.teacherBtn, { backgroundColor: colors.tint }]}
          onPress={() => router.push('/teacher/students')}
          activeOpacity={0.7}
        >
          <FontAwesome name="users" size={15} color="#0D0D0D" />
          <Text style={styles.teacherBtnText}>学员学习情况</Text>
        </TouchableOpacity>
      )}

      <View style={[styles.streakCard, { backgroundColor: colors.card }]}>
        <FontAwesome name="fire" size={28} color={colors.tint} />
        <View style={styles.streakText}>
          <Text style={[styles.streakNum, { color: colors.text }]}>
            {stats.streak} 天
          </Text>
          <Text style={[styles.streakLabel, { color: colors.subtitle }]}>
            连续学习
          </Text>
        </View>
      </View>

      {/* 今日报告 */}
      {today && (
        <View style={[styles.todayCard, { backgroundColor: colors.card }]}>
          <View style={styles.todayTop}>
            <FontAwesome name="sun-o" size={20} color={colors.tint} />
            <Text style={[styles.todayTitle, { color: colors.text }]}>今日</Text>
            <Text style={[styles.todayCount, { color: colors.subtitle }]}>
              学习 {today.studied} 词
            </Text>
          </View>

          <View style={styles.accuracyTop}>
            <Text style={[styles.accuracyLabel, { color: colors.subtitle }]}>
              今日掌握率
            </Text>
            <Text style={[styles.todayRate, { color: '#30A46C' }]}>
              {Math.round(today.accuracy * 100)}%
            </Text>
          </View>
          <View style={styles.barBg}>
            <View
              style={[
                styles.barFill,
                { width: `${Math.round(today.accuracy * 100)}%`, backgroundColor: '#30A46C' },
              ]}
            />
          </View>

          {today.details.length === 0 ? (
            <Text style={[styles.todayHint, { color: colors.subtitle }]}>
              今天还没开始学习哦～
            </Text>
          ) : (
            <View style={styles.detailList}>
              {today.details.map((d, i) => (
                <View
                  key={i}
                  style={[styles.detailRow, { borderColor: colors.border }]}
                >
                  <Text style={[styles.detailWord, { color: colors.text }]}>
                    {d.word}
                  </Text>
                  <Text style={[styles.detailGrade, { color: GRADE_COLOR[d.grade] ?? colors.subtitle }]}>
                    {GRADE_TEXT[d.grade] ?? ''}
                  </Text>
                  <Text style={[styles.detailTime, { color: colors.pinyin }]}>
                    {new Date(d.ts).toLocaleTimeString()}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </View>
      )}

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
          已掌握 {stats.mastered} · 学习中 {stats.learning}
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

const GRADE_TEXT = ['Again', 'Hard', 'Good', 'Easy'];
const GRADE_COLOR: Record<number, string> = {
  0: '#E5484D',
  1: '#F5A623',
  2: '#30A46C',
  3: '#3B82F6',
};

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
  todayCard: {
    borderRadius: 16,
    padding: 18,
    marginBottom: 14,
  },
  todayTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  todayTitle: {
    fontSize: 18,
    fontWeight: '700',
  },
  todayCount: {
    fontSize: 14,
    marginLeft: 'auto',
  },
  todayRate: {
    fontSize: 22,
    fontWeight: '800',
  },
  todayHint: {
    fontSize: 13,
    marginTop: 12,
  },
  detailList: {
    marginTop: 12,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderTopWidth: 1,
  },
  detailWord: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
  },
  detailGrade: {
    fontSize: 13,
    fontWeight: '600',
    width: 48,
    textAlign: 'center',
  },
  detailTime: {
    fontSize: 12,
    width: 64,
    textAlign: 'right',
  },
  teacherBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    paddingVertical: 14,
    marginBottom: 14,
  },
  teacherBtnText: {
    color: '#0D0D0D',
    fontSize: 15,
    fontWeight: '700',
  },
});
