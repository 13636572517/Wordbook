import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useColors from '@/components/useColors';
import { repo } from '@/lib/data';
import type { Wordbook } from '@/lib/data';
import { useSession } from '@/components/SessionProvider';

export default function LibraryScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const {
    user,
    wordbook,
    wordbooks,
    setActiveWordbook,
    createWordbook,
    refreshBooks,
    switchUser,
    users,
  } = useSession();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');

  const load = useCallback(async () => {
    const c: Record<string, number> = {};
    for (const wb of wordbooks) {
      const words = await repo.getWordsByWordbook(wb.id);
      c[wb.id] = words.length;
    }
    setCounts(c);
    setLoading(false);
  }, [wordbooks]);

  useFocusEffect(useCallback(() => {
    load();
  }, [load]));

  const pick = (wb: Wordbook) => {
    setActiveWordbook(wb.id);
    Alert.alert('已切换', `正在学习「${wb.name}」，去 Vocab 标签开始吧`);
  };

  const remove = (wb: Wordbook) => {
    if (wb.type !== 'custom') return;
    Alert.alert('删除词本', `确定删除「${wb.name}」？学习进度也会一并删除。`, [
      { text: '取消', style: 'cancel' },
      {
        text: '删除',
        style: 'destructive',
        onPress: async () => {
          await repo.deleteWordbook(wb.id);
          await refreshBooks();
          load();
        },
      },
    ]);
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    await createWordbook(name);
    setNewName('');
  };

  const switchUserPrompt = () => {
    if (users.length <= 1) {
      Alert.alert('账户', '当前只有一个账户');
      return;
    }
    Alert.alert(
      '切换账户',
      '选择要登录的账户',
      users.map((u) => ({
        text: u.username + (u.id === user?.id ? '（当前）' : ''),
        onPress: () => switchUser(u.id),
      })),
    );
  };

  const systemBooks = wordbooks.filter((w) => w.type === 'system');
  const customBooks = wordbooks.filter((w) => w.type === 'custom');

  const renderBook = (wb: Wordbook) => (
    <TouchableOpacity
      key={wb.id}
      style={[
        styles.card,
        {
          backgroundColor: colors.card,
          borderColor: wb.id === wordbook?.id ? colors.tint : colors.border,
          borderWidth: wb.id === wordbook?.id ? 2 : 1,
        },
      ]}
      onPress={() => pick(wb)}
      activeOpacity={0.7}
    >
      <View style={styles.cardMain}>
        <Text style={[styles.cardName, { color: colors.text }]}>{wb.name}</Text>
        <Text style={[styles.cardCount, { color: colors.subtitle }]}>
          {counts[wb.id] ?? 0} 词
        </Text>
      </View>
      {wb.type === 'custom' && (
        <TouchableOpacity
          style={styles.delBtn}
          onPress={() => remove(wb)}
          activeOpacity={0.6}
        >
          <FontAwesome name="trash" size={18} color="#E5484D" />
        </TouchableOpacity>
      )}
    </TouchableOpacity>
  );

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: insets.top },
      ]}
    >
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>单词本</Text>
        <TouchableOpacity
          style={styles.userChip}
          onPress={switchUserPrompt}
          activeOpacity={0.7}
        >
          <FontAwesome name="user" size={14} color={colors.tint} />
          <Text style={[styles.userName, { color: colors.tint }]}>
            {user?.username}
          </Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.tint} />
      ) : (
        <ScrollView contentContainerStyle={styles.list}>
          <Text style={[styles.groupLabel, { color: colors.subtitle }]}>
            系统词本
          </Text>
          {systemBooks.map(renderBook)}
          <Text style={[styles.groupLabel, { color: colors.subtitle }]}>
            我的词本
          </Text>
          {customBooks.length === 0 ? (
            <Text style={[styles.emptyHint, { color: colors.subtitle }]}>
              还没有自定义词本，下面新建一个吧
            </Text>
          ) : (
            customBooks.map(renderBook)
          )}
        </ScrollView>
      )}

      <View style={[styles.createBar, { borderColor: colors.border }]}>
        <TextInput
          style={[
            styles.createInput,
            {
              backgroundColor: colors.inputBackground,
              borderColor: colors.border,
              color: colors.text,
            },
          ]}
          value={newName}
          onChangeText={setNewName}
          placeholder="新建自定义词本名…"
          placeholderTextColor={colors.pinyin}
        />
        <TouchableOpacity
          style={[
            styles.createBtn,
            {
              backgroundColor: colors.tint,
              opacity: newName.trim() ? 1 : 0.4,
            },
          ]}
          disabled={!newName.trim()}
          onPress={handleCreate}
          activeOpacity={0.7}
        >
          <FontAwesome name="plus" size={16} color="#0D0D0D" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  userChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#2A2520',
  },
  userName: {
    fontSize: 14,
    fontWeight: '600',
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 20,
  },
  groupLabel: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 16,
    marginBottom: 8,
  },
  emptyHint: {
    fontSize: 14,
    marginBottom: 8,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 16,
    padding: 18,
    marginBottom: 10,
  },
  cardMain: {
    flexDirection: 'column',
  },
  cardName: {
    fontSize: 20,
    fontWeight: '700',
  },
  cardCount: {
    fontSize: 13,
    marginTop: 2,
  },
  delBtn: {
    padding: 8,
  },
  createBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  createInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
  createBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
