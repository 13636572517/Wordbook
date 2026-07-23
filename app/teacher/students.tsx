import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  ActivityIndicator,
  FlatList,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import useColors from '@/components/useColors';
import { useSession } from '@/components/SessionProvider';
import { fetchStudents, type StudentInfo } from '@/lib/data/httpRepo';

const USE_CLOUD = process.env.EXPO_PUBLIC_USE_CLOUD === 'true';

export default function TeacherStudentsScreen() {
  const [students, setStudents] = useState<StudentInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [searchText, setSearchText] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { isAdmin, isTeacher } = useSession();

  const load = useCallback(async (query?: string) => {
    if (!USE_CLOUD) return;
    try {
      setLoading(true);
      const data = await fetchStudents(query || undefined);
      setStudents(data);
    } catch {
      // 权限不足或其他错误，返回列表为空
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // 防抖模糊搜索（300ms）
  const onSearchChange = (text: string) => {
    setSearchText(text);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setQ(text.trim());
      load(text.trim() || undefined);
    }, 300);
  };

  // 非教师/管理员 → 403 提示
  if (!isAdmin && !isTeacher) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <Text style={[styles.errorText, { color: colors.subtitle }]}>仅教师/管理员可查看</Text>
        <TouchableOpacity
          style={[styles.backBtn, { backgroundColor: colors.card }]}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <FontAwesome name="arrow-left" size={14} color={colors.tint} />
          <Text style={[styles.backBtnText, { color: colors.tint }]}>返回</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={styles.backBtn}>
          <FontAwesome name="arrow-left" size={16} color={colors.tint} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.text }]}>学员学习情况</Text>
      </View>

      {/* Search */}
      <View style={[styles.searchWrap, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <FontAwesome name="search" size={14} color={colors.subtitle} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          value={searchText}
          onChangeText={onSearchChange}
          placeholder="搜索姓名或手机号..."
          placeholderTextColor={colors.pinyin}
          autoCorrect={false}
        />
      </View>

      {/* List */}
      {loading ? (
        <ActivityIndicator size="large" color={colors.tint} style={{ marginTop: 60 }} />
      ) : students.length === 0 ? (
        <View style={styles.emptyWrap}>
          <FontAwesome name="user-o" size={40} color={colors.subtitle} />
          <Text style={[styles.emptyText, { color: colors.subtitle }]}>
            {q ? '未找到匹配的学员' : '暂无学员数据'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={students}
          keyExtractor={(s) => String(s.user_id)}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.card, { backgroundColor: colors.card }]}
              onPress={() => router.push(`/teacher/students/${item.user_id}` as any)}
              activeOpacity={0.7}
            >
              <View style={styles.cardMain}>
                {item.avatar ? (
                  <View style={[styles.avatar, { backgroundColor: colors.border }]}>
                    <Text style={[styles.avatarText, { color: colors.text }]}>{(item.nickname || '?')[0]}</Text>
                  </View>
                ) : (
                  <View style={[styles.avatar, { backgroundColor: colors.tint }]}>
                    <Text style={[styles.avatarText, { color: '#0D0D0D' }]}>{(item.nickname || '?')[0]}</Text>
                  </View>
                )}
                <View style={styles.cardInfo}>
                  <Text style={[styles.cardName, { color: colors.text }]}>{item.nickname}</Text>
                  <Text style={[styles.cardMeta, { color: colors.subtitle }]}>
                    {item.phone ? `${item.phone} · ` : ''}{item.studied_days} 天 · {item.word_count} 词
                  </Text>
                </View>
              </View>
              <View style={styles.cardStats}>
                <View style={styles.statItem}>
                  <Text style={[styles.statNum, { color: '#30A46C' }]}>{item.recent_days}</Text>
                  <Text style={[styles.statLabel, { color: colors.subtitle }]}>近7天活跃</Text>
                </View>
                <FontAwesome name="chevron-right" size={14} color={colors.subtitle} />
              </View>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 20 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    gap: 12,
  },
  backBtn: {
    padding: 4,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 44,
    gap: 10,
    marginBottom: 14,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    height: 44,
  },
  listContent: {
    gap: 10,
    paddingBottom: 40,
  },
  card: {
    borderRadius: 16,
    padding: 16,
  },
  cardMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
  },
  cardInfo: { flex: 1 },
  cardName: {
    fontSize: 16,
    fontWeight: '600',
  },
  cardMeta: {
    fontSize: 13,
    marginTop: 2,
  },
  cardStats: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#2A2520',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
  },
  statNum: {
    fontSize: 18,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 12,
  },
  emptyWrap: {
    alignItems: 'center',
    marginTop: 80,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 80,
  },
  backBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
