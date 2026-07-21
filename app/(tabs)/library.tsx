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
import { router } from 'expo-router';
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
    wordbook,
    wordbooks,
    setActiveWordbook,
    createWordbook,
    refreshBooks,
  } = useSession();
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [showCreate, setShowCreate] = useState(false);

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
    router.push({ pathname: '/wordbook-detail', params: { id: wb.id, name: wb.name } });
  };

  const setAsActive = (wb: Wordbook) => {
    setActiveWordbook(wb.id);
    Alert.alert('已切换', `正在学习「${wb.name}」，去学习标签开始吧`);
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
    setShowCreate(false);
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
          {wb.id === wordbook?.id ? '  ·  当前学习' : ''}
        </Text>
      </View>
      <View style={styles.cardActions}>
        {wb.id !== wordbook?.id && (
          <TouchableOpacity
            style={styles.setActiveBtn}
            onPress={() => setAsActive(wb)}
            activeOpacity={0.6}
          >
            <FontAwesome name="check-circle-o" size={18} color={colors.tint} />
          </TouchableOpacity>
        )}
        {wb.type === 'custom' && (
          <TouchableOpacity
            style={styles.delBtn}
            onPress={() => remove(wb)}
            activeOpacity={0.6}
          >
            <FontAwesome name="trash" size={16} color="#E5484D" />
          </TouchableOpacity>
        )}
        <FontAwesome name="chevron-right" size={13} color={colors.subtitle} />
      </View>
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
        <Text style={[styles.title, { color: colors.text }]}>词本</Text>
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
              还没有自定义词本，点击下方按钮新建一个吧
            </Text>
          ) : (
            customBooks.map(renderBook)
          )}

          {/* Create new wordbook */}
          {showCreate ? (
            <View style={[styles.createCard, { backgroundColor: colors.card, borderColor: colors.tint }]}>
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
                placeholder="输入词本名称…"
                placeholderTextColor={colors.pinyin}
                autoFocus
              />
              <View style={styles.createActions}>
                <TouchableOpacity
                  style={[styles.createConfirm, { backgroundColor: colors.tint, opacity: newName.trim() ? 1 : 0.4 }]}
                  disabled={!newName.trim()}
                  onPress={handleCreate}
                  activeOpacity={0.7}
                >
                  <Text style={styles.createConfirmText}>创建</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.createCancel}
                  onPress={() => { setShowCreate(false); setNewName(''); }}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.createCancelText, { color: colors.subtitle }]}>取消</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={[styles.addBookCard, { borderColor: colors.border }]}
              onPress={() => setShowCreate(true)}
              activeOpacity={0.7}
            >
              <FontAwesome name="plus" size={20} color={colors.tint} />
              <Text style={[styles.addBookText, { color: colors.tint }]}>
                新建自定义词本
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
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
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  setActiveBtn: {
    padding: 6,
  },
  addBookCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderRadius: 16,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    paddingVertical: 18,
    marginTop: 16,
  },
  addBookText: {
    fontSize: 16,
    fontWeight: '600',
  },
  createCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 16,
    marginTop: 16,
  },
  createInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 12,
  },
  createActions: {
    flexDirection: 'row',
    gap: 12,
  },
  createConfirm: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  createConfirmText: {
    color: '#0D0D0D',
    fontSize: 15,
    fontWeight: '700',
  },
  createCancel: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  createCancelText: {
    fontSize: 15,
    fontWeight: '600',
  },
});
