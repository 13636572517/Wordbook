import type { User, Wordbook } from '@/lib/data';
import { repo } from '@/lib/data';
import { seedBuiltInWordbooks } from '@/lib/data/seedWordbooks';
import {
    loadActiveUser,
    loadActiveWordbook,
    saveActiveUser,
    saveActiveWordbook,
} from '@/lib/data/session';
import React, {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useState,
} from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import useColors from './useColors';

// 云端模式开关（与 lib/data/index.ts 保持一致）
const USE_CLOUD = process.env.EXPO_PUBLIC_USE_CLOUD === 'true';

type SessionValue = {
  user: User | null;
  wordbook: Wordbook | null;
  users: User[];
  wordbooks: Wordbook[];
  loading: boolean;
  isAdmin: boolean;
  setActiveWordbook: (id: string) => Promise<void>;
  switchUser: (id: string) => Promise<void>;
  createUser: (name: string) => Promise<void>;
  createWordbook: (name: string) => Promise<void>;
  refreshBooks: () => Promise<void>;
  logout: () => Promise<void>;
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
  const [isAdmin, setIsAdmin] = useState(false);
  // 登录成功后「会话加载」失败时的错误提示（不再无限转圈，回到登录界面并提示重试）
  const [loginError, setLoginError] = useState('');

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
      try {
        // 云端模式：先检查登录状态，未登录则等待登录
        if (USE_CLOUD) {
          const { isLoggedIn } = await import('@/lib/data/httpRepo');
          const loggedIn = await isLoggedIn();
          if (!loggedIn) {
            setLoading(false);
            return; // 显示登录界面
          }
          // 获取管理员状态；若 token 过期（401 会清除 token）则回到登录界面
          try {
            const { fetchMe } = await import('@/lib/data/httpRepo');
            const me = await fetchMe();
            setIsAdmin(me.is_admin);
          } catch {
            const { isLoggedIn: stillLoggedIn } = await import('@/lib/data/httpRepo');
            if (!(await stillLoggedIn())) {
              if (!cancelled) setLoading(false);
              return; // token 已失效 → 显示登录界面
            }
          }
        }

        // Idempotent: safe on every launch. Seeds built-in wordbooks once.
        if (!USE_CLOUD) await seedBuiltInWordbooks(repo);
        if (cancelled) return;

        const us = await repo.listUsers();
        setUsers(us);
        let activeUserId = await loadActiveUser();
        if (!activeUserId || !us.find((u) => u.id === activeUserId)) {
          if (us.length === 0 && USE_CLOUD) {
            // SSO 模式本地无用户缓存 → 回到登录界面
            if (!cancelled) setLoading(false);
            return;
          }
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
      } catch {
        // 任何未预期的错误都不能卡在加载界面
        if (!cancelled) setLoading(false);
      }
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

  // 退出登录（云端模式）：清除 token + 重置会话状态 → 回到登录界面
  const logout = useCallback(async () => {
    try {
      const { clearToken } = await import('@/lib/data/httpRepo');
      await clearToken();
    } catch { /* ignore */ }
    setUser(null);
    setUsers([]);
    setWordbook(null);
    setWordbooks([]);
    setIsAdmin(false);
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#D4A853" />
      </View>
    );
  }
  if (!user) {
    return USE_CLOUD ? (
      <CloudLoginScreen
        externalError={loginError}
        onSuccess={() => {
          // 登录成功后重新加载会话
          setLoading(true);
          setLoginError('');
          (async () => {
            try {
              // 获取管理员状态
              try {
                const { fetchMe } = await import('@/lib/data/httpRepo');
                const me = await fetchMe();
                setIsAdmin(me.is_admin);
              } catch { /* ignore */ }
              const us = await repo.listUsers();
              setUsers(us);
              const u = us[0] ?? null;
              if (u) {
                setUser(u);
                await saveActiveUser(u.id);
              }
              const wbs = await reloadBooks();
              let activeWbId = await loadActiveWordbook();
              if (!activeWbId || !wbs.find((w) => w.id === activeWbId)) {
                activeWbId = wbs.find((w) => w.type === 'system')?.id ?? wbs[0]?.id ?? null;
                if (activeWbId) await saveActiveWordbook(activeWbId);
              }
              setWordbook(wbs.find((w) => w.id === activeWbId) ?? null);
              setLoading(false);
            } catch (e: any) {
              // 会话加载失败：停止转圈，回到登录界面并显示错误（可重试登录）
              console.error('会话加载失败', e);
              setLoginError(e?.message || '加载会话失败，请重试');
              setLoading(false);
            }
          })();
        }}
      />
    ) : (
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
        isAdmin,
        setActiveWordbook,
        switchUser,
        createUser,
        createWordbook,
        refreshBooks,
        logout,
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

/** 云端模式：GESP 账号密码登录界面 */
function CloudLoginScreen({
  onSuccess,
  externalError,
}: {
  onSuccess: () => void;
  externalError?: string;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const colors = useColors();

  const handleLogin = async () => {
    if (!username.trim() || !password) return;
    setBusy(true);
    setError('');
    try {
      const { login } = await import('@/lib/data/httpRepo');
      await login(username.trim(), password);
      onSuccess();
    } catch (e: any) {
      setError(e.message || '登录失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.authWrap, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.authInner}>
        <Text style={[styles.authTitle, { color: colors.text }]}>登录</Text>
        <Text style={[styles.authSub, { color: colors.subtitle }]}>
          使用语算 GESP 账号登录，学习进度云端同步
        </Text>
        <TextInput
          style={[
            styles.authInput,
            {
              backgroundColor: colors.inputBackground,
              borderColor: colors.border,
              color: colors.text,
            },
          ]}
          value={username}
          onChangeText={setUsername}
          placeholder="账号"
          placeholderTextColor={colors.pinyin}
          autoCapitalize="none"
          autoCorrect={false}
        />
        <TextInput
          style={[
            styles.authInput,
            {
              backgroundColor: colors.inputBackground,
              borderColor: colors.border,
              color: colors.text,
            },
          ]}
          value={password}
          onChangeText={setPassword}
          placeholder="密码"
          placeholderTextColor={colors.pinyin}
          secureTextEntry
          onSubmitEditing={handleLogin}
        />
        {error || externalError ? (
          <Text style={styles.loginError}>{error || externalError}</Text>
        ) : null}
        <TouchableOpacity
          style={[
            styles.authCreate,
            {
              backgroundColor: colors.tint,
              opacity: username.trim() && password && !busy ? 1 : 0.4,
            },
          ]}
          disabled={!username.trim() || !password || busy}
          onPress={handleLogin}
          activeOpacity={0.7}
        >
          {busy ? (
            <ActivityIndicator size="small" color="#0D0D0D" />
          ) : (
            <Text style={styles.authCreateText}>登录</Text>
          )}
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
  loginError: { color: '#E05252', fontSize: 14, marginBottom: 12, textAlign: 'center' },
});
