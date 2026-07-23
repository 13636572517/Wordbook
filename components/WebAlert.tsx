/**
 * Web-compatible Alert/Confirm system.
 * React Native Web 的 Alert.alert() 在 PWA 环境下不弹窗、回调不触发。
 * 本模块提供全局 Provider + useWebAlert() hook，API 兼容 Alert.alert()，
 * Web 端渲染自定义浮层，Native 端可回退到原生 Alert。
 */
import React, { createContext, useCallback, useContext, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import useColors from './useColors';

interface AlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

interface AlertState {
  visible: boolean;
  title: string;
  message?: string;
  buttons: AlertButton[];
}

type AlertFn = (title: string, message?: string, buttons?: AlertButton[]) => void;

const WebAlertContext = createContext<AlertFn>(() => {});

/** Hook：获取 webAlert 函数，签名与 Alert.alert 一致 */
export function useWebAlert(): AlertFn {
  return useContext(WebAlertContext);
}

export function WebAlertProvider({ children }: { children: React.ReactNode }) {
  const colors = useColors();
  const [state, setState] = useState<AlertState>({
    visible: false,
    title: '',
    message: undefined,
    buttons: [],
  });

  const showAlert: AlertFn = useCallback((title, message, buttons) => {
    const btns = buttons && buttons.length > 0 ? buttons : [{ text: '确定' }];
    setState({ visible: true, title, message, buttons: btns });
  }, []);

  const handlePress = (btn: AlertButton) => {
    setState((s) => ({ ...s, visible: false }));
    // 延迟执行回调，等浮层关闭动画完成
    setTimeout(() => btn.onPress?.(), 50);
  };

  // 按 style 排序：cancel 放左边，destructive/default 放右边
  const sortedButtons = [...state.buttons].sort((a, b) => {
    if (a.style === 'cancel') return -1;
    if (b.style === 'cancel') return 1;
    return 0;
  });

  return (
    <WebAlertContext.Provider value={showAlert}>
      {children}
      {state.visible && (
        <View style={styles.overlay}>
          <View style={[styles.dialog, { backgroundColor: colors.card }]}>
            <Text style={[styles.title, { color: colors.text }]}>
              {state.title}
            </Text>
            {state.message ? (
              <Text style={[styles.message, { color: colors.subtitle }]}>
                {state.message}
              </Text>
            ) : null}
            <View style={styles.actions}>
              {sortedButtons.map((btn, i) => {
                const isCancel = btn.style === 'cancel';
                const isDestructive = btn.style === 'destructive';
                const bg = isCancel
                  ? 'transparent'
                  : isDestructive
                    ? '#E5484D'
                    : colors.tint;
                const textColor = isCancel ? colors.text : isDestructive ? '#FFF' : '#0D0D0D';
                return (
                  <TouchableOpacity
                    key={i}
                    style={[
                      styles.btn,
                      { backgroundColor: bg },
                      isCancel && { borderWidth: 1.5, borderColor: colors.border },
                    ]}
                    onPress={() => handlePress(btn)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.btnText, { color: textColor }]}>
                      {btn.text}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </View>
      )}
    </WebAlertContext.Provider>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  dialog: {
    borderRadius: 20,
    padding: 24,
    width: '82%',
    maxWidth: 340,
    alignItems: 'center',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 15,
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 22,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    width: '100%',
  },
  btn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  btnText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
