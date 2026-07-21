import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from 'react';
import {
  StyleSheet,
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import useColors from './useColors';
import { repo } from '@/lib/data';
import { seedBuiltInWordbooks } from '@/lib/data/seedWordbooks';
import {
  loadActiveUser,
  saveActiveUser,
  loadActiveWordbook,
  saveActiveWordbook,
} from '@/lib/data/session';
import type { User, Wordbook } from '@/lib/data';

type SessionValue = {
  user: User | null;
  wordbook: Wordbook | null;
  users: User[];
  wordbooks: Wordbook[];
  loading: boolean;
  setActiveWordbook: (id: string) => Promise<void>;
  switchUser: (id: string) => Promise<void>;
  createUser: (name: string) => Promise<void>;
  createWordbook: (name: string) => Promise<void>;
  refreshBooks: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within <SessionProvider>');
  return ctx;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [wordbook, setWordbook] = useState<Wordbook | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [wordbooks, setWordbooks] = useState<Wordbook[]>([]);
  const [loading, setLoading] = useState(true);

  const reloadBooks = useCallback(async (): Promise<Wordbook[]> => {
    const wbs = await repo.listWordbooks();
    setWordbooks(wbs);
    return wbs;
  }, []);

  const refreshBooks = useCallback(async () => {
    await reloadBooks();
  }, [reloadBooks]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      // Idempotent: safe on every launch. Seeds built-in wordbooks once.
      await seedBuiltInWordbooks(repo);
      if (cancelled) return;

      const us = await repo.listUsers();
      setUsers(us);
      let activeUserId = await loadActiveUser();
      if (!activeUserId || !us.find((u) => u.id === activeUserId)) {
        const u = us.length > 0 ? us[0] : await repo.createUser('我');
        activeUserId = u.id;
        await saveActiveUser(activeUserId);
        if (us.length === 0) setUsers([u]);
      }
      if (cancelled) return;
      const uObj = us.find((x) => x.id === activeUserId) ?? (await repo.getUser(activeUserId));
      setUser(uObj);

      const wbs = await reloadBooks();
      if (cancelled) return;
      let activeWbId = await loadActiveWordbook();
      if (!activeWbId || !wbs.find((w) => w.id === activeWbId)) {
        activeWbId = wbs.find((w) => w.type === 'system')?.id ?? wbs[0]?.id ?? null;
        if (activeWbId) await saveActiveWordbook(activeWbId);
      }
      if (cancelled) return;
      setWordbook(wbs.find((w) => w.id === activeWbId) ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadBooks]);

  const setActiveWordbook = useCallback(async (id: string) => {
    await saveActiveWordbook(id);
    const wb = await repo.getWordbook(id);
    setWordbook(wb);
  }, []);

  const switchUser = useCallback(
    async (id: string) => {
      await saveActiveUser(id);
      await repo.setActiveUser(id);
      const u = await repo.getUser(id);
      setUser(u);
      const wbs = await reloadBooks();
      const def = wbs.find((w) => w.type === 'system')?.id ?? wbs[0]?.id ?? null;
      if (def) {
        await saveActiveWordbook(def);
        setWordbook(wbs.find((w) => w.id === def) ?? null);
      }
    },
    [reloadBooks],
  );

  const createUser = useCallback(async (name: string) => {
    const u = await repo.createUser(name.trim() || '我');
    await saveActiveUser(u.id);
    setUser(u);
    setUsers(await repo.listUsers());
  }, []);

  const createWordbook = useCallback(
    async (name: string) => {
      const wb = await repo.createWordbook({
        ownerId: user?.id ?? null,
        name: name.trim(),
        level: 'custom',
        type: 'custom',
        source: 'custom',
      });
      await reloadBooks();
      await setActiveWordbook(wb.id);
    },
    [user, reloadBooks, setActiveWordbook],
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#D4A853" />
      </View>
    );
  }
  if (!user) {
    return (
      <AuthScreen users={users} onPick={switchUser} onCreate={createUser} />
    );
  }
  return (
    <SessionContext.Provider
      value={{
        user,
        wordbook,
        users,
        wordbooks,
        loading,
        setActiveWordbook,
        switchUser,
        createUser,
        createWordbook,
        refreshBooks,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}

function AuthScreen({
  users,
  onPick,
  onCreate,
}: {
  users: User[];
  onPick: (id: string) => Promise<void>;
  onCreate: (name: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const colors = useColors();
  return (
    <KeyboardAvoidingView
      style={[styles.authWrap, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.authInner}>
        <Text style={[styles.authTitle, { color: colors.text }]}>选择账户</Text>
        <Text style={[styles.authSub, { color: colors.subtitle }]}>
          不同账户有独立的学习进度
        </Text>
        {users.map((u) => (
          <TouchableOpacity
            key={u.id}
            style={[styles.authUser, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => onPick(u.id)}
            activeOpacity={0.7}
          >
            <Text style={[styles.authUserName, { color: colors.text }]}>{u.username}</Text>
          </TouchableOpacity>
        ))}
        <View style={styles.authDivider} />
        <TextInput
          style={[
            styles.authInput,
            {
              backgroundColor: colors.inputBackground,
              borderColor: colors.border,
              color: colors.text,
            },
          ]}
          value={name}
          onChangeText={setName}
          placeholder="新建账户名"
          placeholderTextColor={colors.pinyin}
        />
        <TouchableOpacity
          style={[
            styles.authCreate,
            { backgroundColor: colors.tint, opacity: name.trim() ? 1 : 0.4 },
          ]}
          disabled={!name.trim()}
          onPress={() => onCreate(name)}
          activeOpacity={0.7}
        >
          <Text style={styles.authCreateText}>创建并登录</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    backgroundColor: '#0D0D0D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  authWrap: { flex: 1 },
  authInner: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 },
  authTitle: { fontSize: 28, fontWeight: '800', marginBottom: 6 },
  authSub: { fontSize: 14, marginBottom: 24 },
  authUser: {
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginBottom: 10,
    borderWidth: 1,
  },
  authUserName: { fontSize: 17, fontWeight: '600' },
  authDivider: { height: 1, backgroundColor: '#2A2520', marginVertical: 18 },
  authInput: {
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 12,
  },
  authCreate: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  authCreateText: { color: '#0D0D0D', fontSize: 17, fontWeight: '700' },
});
