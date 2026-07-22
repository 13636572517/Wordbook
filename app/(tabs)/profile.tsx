import { useSession } from '@/components/SessionProvider';
import useColors from '@/components/useColors';
import { repo } from '@/lib/data';
import { getWordbookStats } from '@/lib/data/stats';
import { getDailyNewWordGoal, setDailyNewWordGoal } from '@/lib/data/settings';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useFocusEffect } from '@react-navigation/native';
import React, { useCallback, useState } from 'react';
import {
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// 云端模式开关（与 lib/data/index.ts 保持一致）
const USE_CLOUD = process.env.EXPO_PUBLIC_USE_CLOUD === 'true';

export default function ProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { user, users, wordbook, wordbooks, switchUser, createUser, logout } =
    useSession();
  const [totalStats, setTotalStats] = useState({
    total: 0,
    mastered: 0,
    due: 0,
    streak: 0,
    accuracy: 0,
  });
  const [showUserModal, setShowUserModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [goalInput, setGoalInput] = useState('20');

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      (async () => {
        const now = Date.now();
        let total = 0;
        let mastered = 0;
        let due = 0;
        let streak = 0;
        let accSum = 0;
        let accCount = 0;
        for (const wb of wordbooks) {
          try {
            const s = await getWordbookStats(repo, user.id, wb.id, now);
            total += s.total;
            mastered += s.mastered;
            due += s.due;
            streak = Math.max(streak, s.streak);
            if (s.accuracy > 0) {
              accSum += s.accuracy;
              accCount++;
            }
          } catch {
            // skip wordbooks with no progress
          }
        }
        setTotalStats({
          total,
          mastered,
          due,
          streak,
          accuracy: accCount > 0 ? accSum / accCount : 0,
        });
      })();
    }, [user, wordbooks]),
  );

  // 每日新词目标（每用户全局）：进入页面时载入当前值
  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      (async () => {
        const g = await getDailyNewWordGoal(user.id);
        setGoalInput(String(g));
      })();
    }, [user]),
  );

  const handleGoalChange = async (text: string) => {
    setGoalInput(text);
    if (!user) return;
    const n = parseInt(text, 10);
    if (Number.isFinite(n) && n >= 0) {
      await setDailyNewWordGoal(user.id, n);
    }
  };

  const handleSwitch = (id: string) => {
    setShowUserModal(false);
    switchUser(id);
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    await createUser(name);
    setNewName('');
    setShowUserModal(false);
  };

  const avatarLetter = (user?.username ?? '?').charAt(0).toUpperCase();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.background, paddingTop: insets.top },
      ]}
    >
      <Text style={[styles.title, { color: colors.text }]}>我的</Text>

      <ScrollView contentContainerStyle={styles.content}>
        {/* User Card */}
        <TouchableOpacity
          style={[styles.userCard, { backgroundColor: colors.card }]}
          onPress={() => !USE_CLOUD && setShowUserModal(true)}
          activeOpacity={0.7}
        >
          <View style={[styles.avatar, { backgroundColor: colors.tint }]}>
            <Text style={styles.avatarText}>{avatarLetter}</Text>
          </View>
          <View style={styles.userInfo}>
            <Text style={[styles.userName, { color: colors.text }]}>
              {user?.username}
            </Text>
            <Text style={[styles.userHint, { color: colors.subtitle }]}>
              {USE_CLOUD ? 'GESP 云端账户，进度云端同步' : '点击切换账户 / 新建账户'}
            </Text>
          </View>
          {!USE_CLOUD && (
            <FontAwesome
              name="chevron-right"
              size={16}
              color={colors.subtitle}
            />
          )}
        </TouchableOpacity>

        {/* Learning Overview */}
        <Text style={[styles.sectionTitle, { color: colors.subtitle }]}>
          学习总览
        </Text>
        <View style={styles.statsGrid}>
          <StatBox
            icon="book"
            value={String(totalStats.total)}
            label="总词汇"
            color={colors.tint}
            bg={colors.card}
          />
          <StatBox
            icon="star"
            value={String(totalStats.mastered)}
            label="已掌握"
            color="#30A46C"
            bg={colors.card}
          />
          <StatBox
            icon="clock-o"
            value={String(totalStats.due)}
            label="待复习"
            color="#F5A623"
            bg={colors.card}
          />
          <StatBox
            icon="fire"
            value={`${totalStats.streak}天`}
            label="连续学习"
            color="#E5484D"
            bg={colors.card}
          />
        </View>

        {/* Current Wordbook */}
        <Text style={[styles.sectionTitle, { color: colors.subtitle }]}>
          当前词本
        </Text>
        <View style={[styles.infoRow, { backgroundColor: colors.card }]}>
          <FontAwesome name="book" size={18} color={colors.tint} />
          <Text style={[styles.infoText, { color: colors.text }]}>
            {wordbook?.name ?? '未选择'}
          </Text>
        </View>

        {/* 每日新词目标（每用户全局，所有词本共用）*/}
        <Text style={[styles.sectionTitle, { color: colors.subtitle }]}>
          学习设置
        </Text>
        <View style={[styles.goalCard, { backgroundColor: colors.card }]}>
          <Text style={[styles.goalLabel, { color: colors.text }]}>
            每日新词目标
          </Text>
          <TextInput
            style={[
              styles.goalInput,
              {
                backgroundColor: colors.inputBackground,
                borderColor: colors.border,
                color: colors.text,
              },
            ]}
            value={goalInput}
            onChangeText={handleGoalChange}
            keyboardType="numeric"
            placeholder="20"
            placeholderTextColor={colors.subtitle}
          />
        </View>
        <Text style={[styles.goalNote, { color: colors.subtitle }]}>
          全局生效，所有词本共用
        </Text>

        {/* Account List Info（仅本地模式）*/}
        {!USE_CLOUD && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.subtitle }]}>
              账户列表（{users.length}）
            </Text>
            {users.map((u) => (
              <View
                key={u.id}
                style={[
                  styles.accountRow,
                  {
                    backgroundColor: colors.card,
                    borderColor:
                      u.id === user?.id ? colors.tint : colors.border,
                    borderWidth: u.id === user?.id ? 1.5 : 1,
                  },
                ]}
              >
                <View
                  style={[
                    styles.miniAvatar,
                    {
                      backgroundColor:
                        u.id === user?.id ? colors.tint : colors.border,
                    },
                  ]}
                >
                  <Text style={styles.miniAvatarText}>
                    {u.username.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text style={[styles.accountName, { color: colors.text }]}>
                  {u.username}
                </Text>
                {u.id === user?.id && (
                  <Text style={[styles.currentBadge, { color: colors.tint }]}>
                    当前
                  </Text>
                )}
              </View>
            ))}
            {/* 显式切换 / 退出（本地模式不再藏在点卡片里）*/}
            <View style={styles.accountActions}>
              <TouchableOpacity
                style={[styles.ghostBtn, { borderColor: colors.border }]}
                onPress={() => setShowUserModal(true)}
                activeOpacity={0.7}
              >
                <Text style={[styles.ghostBtnText, { color: colors.text }]}>
                  切换账号
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.ghostBtn, { borderColor: '#E05252' }]}
                onPress={logout}
                activeOpacity={0.7}
              >
                <Text style={[styles.ghostBtnText, { color: '#E05252' }]}>
                  退出登录
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* 云端模式：退出登录 / 切换账号 */}
        {USE_CLOUD && (
          <TouchableOpacity
            style={[styles.logoutBtn, { borderColor: '#E05252' }]}
            onPress={logout}
            activeOpacity={0.7}
          >
            <FontAwesome name="sign-out" size={16} color="#E05252" />
            <Text style={styles.logoutText}>退出登录 / 切换账号</Text>
          </TouchableOpacity>
        )}

        {/* Future: SSO Login */}
        {!USE_CLOUD && (
          <View style={[styles.ssoHint, { borderColor: colors.border }]}>
            <FontAwesome name="cloud" size={16} color={colors.subtitle} />
            <Text style={[styles.ssoText, { color: colors.subtitle }]}>
              云端账户同步（即将上线）
            </Text>
          </View>
        )}
      </ScrollView>

      {/* User Switch/Create Modal（仅本地模式）*/}
      {!USE_CLOUD && (
      <Modal
        visible={showUserModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowUserModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[styles.modalContent, { backgroundColor: colors.card }]}
          >
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              账户管理
            </Text>

            {users.map((u) => (
              <TouchableOpacity
                key={u.id}
                style={[
                  styles.modalUserRow,
                  {
                    backgroundColor: colors.background,
                    borderColor:
                      u.id === user?.id ? colors.tint : colors.border,
                    borderWidth: u.id === user?.id ? 1.5 : 1,
                  },
                ]}
                onPress={() => handleSwitch(u.id)}
                activeOpacity={0.7}
              >
                <Text style={[styles.modalUserName, { color: colors.text }]}>
                  {u.username}
                </Text>
                {u.id === user?.id && (
                  <FontAwesome name="check" size={16} color={colors.tint} />
                )}
              </TouchableOpacity>
            ))}

            <View
              style={[styles.modalDivider, { backgroundColor: colors.border }]}
            />

            <TextInput
              style={[
                styles.modalInput,
                {
                  backgroundColor: colors.background,
                  borderColor: colors.border,
                  color: colors.text,
                },
              ]}
              value={newName}
              onChangeText={setNewName}
              placeholder="输入新账户名…"
              placeholderTextColor={colors.subtitle}
            />
            <TouchableOpacity
              style={[
                styles.modalCreateBtn,
                {
                  backgroundColor: colors.tint,
                  opacity: newName.trim() ? 1 : 0.4,
                },
              ]}
              disabled={!newName.trim()}
              onPress={handleCreate}
              activeOpacity={0.7}
            >
              <Text style={styles.modalCreateText}>创建并切换</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.modalClose}
              onPress={() => setShowUserModal(false)}
              activeOpacity={0.7}
            >
              <Text style={[styles.modalCloseText, { color: colors.subtitle }]}>
                关闭
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      )}
    </View>
  );
}

function StatBox({
  icon,
  value,
  label,
  color,
  bg,
}: {
  icon: React.ComponentProps<typeof FontAwesome>['name'];
  value: string;
  label: string;
  color: string;
  bg: string;
}) {
  return (
    <View style={[styles.statBox, { backgroundColor: bg }]}>
      <FontAwesome name={icon} size={18} color={color} />
      <Text style={[styles.statValue, { color: '#E8E0D4' }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.5,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  content: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    padding: 18,
    marginBottom: 20,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 22,
    fontWeight: '700',
    color: '#0D0D0D',
  },
  userInfo: {
    flex: 1,
    marginLeft: 14,
  },
  userName: {
    fontSize: 20,
    fontWeight: '700',
  },
  userHint: {
    fontSize: 13,
    marginTop: 2,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 20,
    marginBottom: 10,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  statBox: {
    width: '48%',
    alignItems: 'center',
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 12,
  },
  statValue: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 6,
  },
  statLabel: {
    fontSize: 12,
    color: '#9C9486',
    marginTop: 2,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 14,
    padding: 16,
  },
  infoText: {
    fontSize: 16,
    fontWeight: '600',
  },
  goalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 14,
    padding: 16,
  },
  goalLabel: {
    fontSize: 16,
    fontWeight: '600',
  },
  goalInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    width: 90,
    textAlign: 'center',
  },
  goalNote: {
    fontSize: 13,
    marginTop: 8,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    padding: 14,
    marginBottom: 8,
  },
  miniAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  miniAvatarText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0D0D0D',
  },
  accountName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 12,
  },
  accountActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  ghostBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    paddingVertical: 14,
    borderWidth: 1.5,
  },
  ghostBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  currentBadge: {
    fontSize: 13,
    fontWeight: '600',
  },
  ssoHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 28,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  ssoText: {
    fontSize: 14,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 28,
    paddingVertical: 15,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  logoutText: {
    color: '#E05252',
    fontSize: 16,
    fontWeight: '700',
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
  },
  modalUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: 12,
    padding: 16,
    marginBottom: 8,
  },
  modalUserName: {
    fontSize: 17,
    fontWeight: '600',
  },
  modalDivider: {
    height: 1,
    marginVertical: 14,
  },
  modalInput: {
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 12,
  },
  modalCreateBtn: {
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
  },
  modalCreateText: {
    color: '#0D0D0D',
    fontSize: 16,
    fontWeight: '700',
  },
  modalClose: {
    alignItems: 'center',
    marginTop: 16,
    paddingVertical: 8,
  },
  modalCloseText: {
    fontSize: 15,
  },
});
