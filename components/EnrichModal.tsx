/**
 * 一键补全释义 — 进度弹窗（仅桌面网页版使用）。
 *
 * 功能：
 * - 启动/继续补全任务（断点续传，自动跳过已完成）
 * - 实时轮询进度（1.5s），展示进度条 + 逐词明细日志
 * - 支持中途停止（优雅停止，当前词完成后退出）
 * - 任务异常中断时提示可重新启动继续
 */
import useColors from '@/components/useColors';
import type { EnrichProgress } from '@/lib/data/httpRepo';
import {
    fetchEnrichProgress,
    startEnrich,
    stopEnrich,
} from '@/lib/data/httpRepo';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

const POLL_INTERVAL = 1500;

const STATUS_LABELS: Record<string, string> = {
  idle: '未开始',
  starting: '正在启动…',
  running: '运行中',
  stopped: '已停止',
  done: '已完成',
  error: '出错',
  interrupted: '异常中断',
};

const STATUS_COLORS: Record<string, string> = {
  idle: '#889096',
  starting: '#D4A853',
  running: '#30A46C',
  stopped: '#E8930C',
  done: '#30A46C',
  error: '#E5484D',
  interrupted: '#E5484D',
};

const LOG_STATUS_ICONS: Record<string, { icon: string; color: string }> = {
  ok: { icon: 'check-circle', color: '#30A46C' },
  skip: { icon: 'minus-circle', color: '#889096' },
  fail: { icon: 'times-circle', color: '#E5484D' },
  info: { icon: 'info-circle', color: '#449DD4' },
  error: { icon: 'exclamation-circle', color: '#E5484D' },
};

interface Props {
  visible: boolean;
  onClose: () => void;
  /** 任务结束后回调（刷新词表） */
  onFinished?: () => void;
}

export default function EnrichModal({ visible, onClose, onFinished }: Props) {
  const colors = useColors();
  const [progress, setProgress] = useState<EnrichProgress | null>(null);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [actionError, setActionError] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const wasRunningRef = useRef(false);

  const poll = useCallback(async () => {
    try {
      const p = await fetchEnrichProgress();
      setProgress(p);
      // 任务从 running 变为终态 → 停止轮询，通知刷新
      if (wasRunningRef.current && !['running', 'starting'].includes(p.status)) {
        stopPolling();
        onFinished?.();
      }
      wasRunningRef.current = ['running', 'starting'].includes(p.status);
    } catch {
      // 网络错误时不停止轮询，静默重试
    }
  }, [onFinished]);

  const startPolling = useCallback(() => {
    if (timerRef.current) return;
    poll();
    timerRef.current = setInterval(poll, POLL_INTERVAL);
  }, [poll]);

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // 弹窗打开时：获取状态，若正在运行则自动轮询
  useEffect(() => {
    if (!visible) {
      stopPolling();
      return;
    }
    setActionError('');
    (async () => {
      try {
        const p = await fetchEnrichProgress();
        setProgress(p);
        wasRunningRef.current = ['running', 'starting'].includes(p.status);
        if (['running', 'starting'].includes(p.status)) {
          startPolling();
        }
      } catch { /* ignore */ }
    })();
    return stopPolling;
  }, [visible, startPolling, stopPolling]);

  const handleStart = async () => {
    setStarting(true);
    setActionError('');
    try {
      const res = await startEnrich();
      if (!res.started) {
        setActionError(res.reason || '启动失败');
      } else {
        wasRunningRef.current = true;
        startPolling();
      }
    } catch (e: any) {
      setActionError(e.message || '启动失败');
    } finally {
      setStarting(false);
    }
  };

  const handleStop = async () => {
    setStopping(true);
    try {
      await stopEnrich();
    } catch (e: any) {
      setActionError(e.message || '停止失败');
    } finally {
      setStopping(false);
    }
  };

  const isRunning = progress ? ['running', 'starting'].includes(progress.status) : false;
  const processed = progress ? progress.done + progress.failed + progress.skipped : 0;
  const pct = progress && progress.total > 0 ? Math.min(100, (processed / progress.total) * 100) : 0;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={[styles.panel, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Header */}
          <View style={styles.panelHeader}>
            <FontAwesome name="magic" size={16} color={colors.tint} />
            <Text style={[styles.panelTitle, { color: colors.text }]}>一键补全释义</Text>
            {progress && (
              <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[progress.status] || '#889096') + '22' }]}>
                <Text style={[styles.statusText, { color: STATUS_COLORS[progress.status] || '#889096' }]}>
                  {STATUS_LABELS[progress.status] || progress.status}
                </Text>
              </View>
            )}
            <TouchableOpacity style={styles.closeBtn} onPress={onClose} activeOpacity={0.6}>
              <FontAwesome name="times" size={18} color={colors.subtitle} />
            </TouchableOpacity>
          </View>

          {/* Progress bar */}
          {progress && progress.total > 0 && (
            <View style={styles.progressSection}>
              <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
                <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: colors.tint }]} />
              </View>
              <Text style={[styles.progressLabel, { color: colors.subtitle }]}>
                {processed}/{progress.total}（{pct.toFixed(1)}%）
              </Text>
            </View>
          )}

          {/* Stats row */}
          {progress && (
            <View style={styles.statsRow}>
              <StatItem label="成功" value={progress.done} color="#30A46C" />
              <StatItem label="失败" value={progress.failed} color="#E5484D" />
              <StatItem label="无结果" value={progress.skipped} color="#889096" />
              {progress.current_word && isRunning && (
                <View style={styles.currentWord}>
                  <ActivityIndicator size="small" color={colors.tint} />
                  <Text style={[styles.currentWordText, { color: colors.subtitle }]} numberOfLines={1}>
                    {progress.current_word}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Error / interruption notice */}
          {progress?.error && (
            <Text style={styles.errorText}>{progress.error}</Text>
          )}
          {progress?.status === 'interrupted' && (
            <Text style={[styles.hintText, { color: colors.pinyin }]}>
              可点击"开始补全"从断点继续
            </Text>
          )}
          {actionError ? <Text style={styles.errorText}>{actionError}</Text> : null}

          {/* Log list */}
          <View style={[styles.logWrap, { borderColor: colors.border }]}>
            {progress && progress.recent_log.length > 0 ? (
              <ScrollView style={styles.logScroll} nestedScrollEnabled>
                {progress.recent_log.map((entry, i) => {
                  const meta = LOG_STATUS_ICONS[entry.status] || LOG_STATUS_ICONS.info;
                  if (entry.word === '__system__') {
                    return (
                      <Text key={`${entry.ts}-${i}`} style={[styles.logSystem, { color: colors.pinyin }]}>
                        {entry.detail}
                      </Text>
                    );
                  }
                  return (
                    <View key={`${entry.ts}-${i}`} style={styles.logRow}>
                      <FontAwesome name={meta.icon as any} size={12} color={meta.color} style={styles.logIcon} />
                      <Text style={[styles.logWord, { color: colors.text }]}>{entry.word}</Text>
                      <Text style={[styles.logDetail, { color: colors.subtitle }]} numberOfLines={1}>
                        {entry.detail}
                      </Text>
                    </View>
                  );
                })}
              </ScrollView>
            ) : (
              <View style={styles.logEmpty}>
                <Text style={[styles.logEmptyText, { color: colors.pinyin }]}>
                  {isRunning ? '等待日志…' : '点击"开始补全"运行，自动跳过已有释义的单词'}
                </Text>
              </View>
            )}
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            {isRunning ? (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#E5484D' }]}
                onPress={handleStop}
                disabled={stopping}
                activeOpacity={0.7}
              >
                {stopping ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.actionBtnText}>停止</Text>
                )}
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: colors.tint }]}
                onPress={handleStart}
                disabled={starting}
                activeOpacity={0.7}
              >
                {starting ? (
                  <ActivityIndicator size="small" color="#0D0D0D" />
                ) : (
                  <Text style={[styles.actionBtnText, { color: '#0D0D0D' }]}>
                    {progress && ['stopped', 'interrupted', 'error'].includes(progress.status)
                      ? '继续补全'
                      : '开始补全'}
                  </Text>
                )}
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.actionBtn, styles.actionBtnSecondary, { borderColor: colors.border }]}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={[styles.actionBtnTextSecondary, { color: colors.subtitle }]}>
                {isRunning ? '后台运行' : '关闭'}
              </Text>
            </TouchableOpacity>
          </View>
          {isRunning && (
            <Text style={[styles.bgHint, { color: colors.pinyin }]}>
              关闭窗口后任务仍在服务器后台运行，可随时回来查看进度
            </Text>
          )}
        </View>
      </View>
    </Modal>
  );
}

function StatItem({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={styles.statItem}>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  panel: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '85%',
    borderRadius: 20,
    borderWidth: 1,
    padding: 20,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  panelTitle: {
    fontSize: 17,
    fontWeight: '700',
    flex: 1,
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '600',
  },
  closeBtn: {
    padding: 4,
  },
  progressSection: {
    marginBottom: 10,
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressLabel: {
    fontSize: 12,
    marginTop: 4,
    textAlign: 'right',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginBottom: 10,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
  },
  statLabel: {
    fontSize: 11,
    color: '#889096',
  },
  currentWord: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  currentWordText: {
    fontSize: 13,
    fontStyle: 'italic',
    flexShrink: 1,
  },
  errorText: {
    color: '#E5484D',
    fontSize: 13,
    marginBottom: 8,
  },
  hintText: {
    fontSize: 12,
    marginBottom: 8,
  },
  logWrap: {
    borderWidth: 1,
    borderRadius: 12,
    minHeight: 140,
    maxHeight: 260,
    marginBottom: 14,
  },
  logScroll: {
    padding: 10,
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    gap: 6,
  },
  logIcon: {
    width: 14,
  },
  logWord: {
    fontSize: 13,
    fontWeight: '600',
    minWidth: 90,
  },
  logDetail: {
    fontSize: 12,
    flex: 1,
  },
  logSystem: {
    fontSize: 12,
    fontStyle: 'italic',
    paddingVertical: 3,
  },
  logEmpty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 140,
  },
  logEmptyText: {
    fontSize: 13,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
  },
  actionBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
  },
  actionBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
  actionBtnSecondary: {
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  actionBtnTextSecondary: {
    fontSize: 15,
    fontWeight: '600',
  },
  bgHint: {
    fontSize: 11,
    textAlign: 'center',
    marginTop: 8,
  },
});
