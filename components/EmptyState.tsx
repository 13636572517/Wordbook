import Layout from '@/constants/Layout';
import useColors from '@/components/useColors';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

// 全站统一的空状态/结果页组件：emoji + 标题 + 副标题 + 自定义操作区。
// 各页面不再各自手写一套空状态样式。
type Props = {
  icon?: string;
  title: string;
  subtitle?: string;
  children?: React.ReactNode;
};

export default function EmptyState({ icon, title, subtitle, children }: Props) {
  const colors = useColors();
  return (
    <View style={styles.wrap}>
      {icon ? <Text style={styles.icon}>{icon}</Text> : null}
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.subtitle, { color: colors.subtitle }]}>{subtitle}</Text>
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 60,
    paddingHorizontal: Layout.pagePadding,
  },
  icon: {
    fontSize: 64,
    marginBottom: Layout.spacing.lg,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginBottom: 6,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 15,
    marginBottom: 28,
    textAlign: 'center',
  },
});
