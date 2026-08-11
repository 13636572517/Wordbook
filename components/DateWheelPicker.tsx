// 三列滚轮日期选择器（年/月/日），支持滚动吸附与点选，可清除。
import React, { useEffect, useRef, useState } from 'react';
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import useColors from './useColors';

const ITEM_H = 40;
const VISIBLE_ROWS = 5;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  for (let i = from; i <= to; i++) out.push(i);
  return out;
}

function Wheel({
  options, selected, label, onSelect,
}: {
  options: number[]; selected: number; label: string; onSelect: (v: number) => void;
}) {
  const ref = useRef<ScrollView>(null);
  useEffect(() => {
    const idx = options.indexOf(selected);
    if (idx >= 0) ref.current?.scrollTo({ y: idx * ITEM_H, animated: false });
  }, [selected, options]);
  return (
    <View style={wheelStyles.wrap}>
      <ScrollView
        ref={ref}
        style={{ height: ITEM_H * VISIBLE_ROWS }}
        snapToInterval={ITEM_H}
        decelerationRate="fast"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: ITEM_H * ((VISIBLE_ROWS - 1) / 2) }}
        onMomentumScrollEnd={(e) => {
          const idx = Math.round(e.nativeEvent.contentOffset.y / ITEM_H);
          const v = options[Math.max(0, Math.min(options.length - 1, idx))];
          if (v !== selected) onSelect(v);
        }}
      >
        {options.map((v) => (
          <TouchableOpacity
            key={v}
            onPress={() => onSelect(v)}
            style={{ height: ITEM_H, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2 }}
          >
            <Text style={{ fontSize: 17, fontWeight: v === selected ? '700' : '400', opacity: v === selected ? 1 : 0.4 }}>{v}</Text>
            <Text style={{ fontSize: 12, opacity: v === selected ? 0.9 : 0.35 }}>{label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

export default function DateWheelPicker({
  visible, value, onConfirm, onClose,
}: {
  visible: boolean;
  value: string | null;
  onConfirm: (date: string | null) => void;
  onClose: () => void;
}) {
  const colors = useColors();
  const now = new Date();
  const years = range(now.getFullYear() - 1, now.getFullYear() + 3);

  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [day, setDay] = useState(now.getDate());

  // 打开时从当前值初始化
  useEffect(() => {
    if (!visible) return;
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      const [y, m, d] = value.split('-').map(Number);
      setYear(years.includes(y) ? y : now.getFullYear());
      setMonth(m);
      setDay(d);
    } else {
      setYear(now.getFullYear());
      setMonth(now.getMonth() + 1);
      setDay(now.getDate());
    }
  }, [visible, value]);

  const daysInMonth = new Date(year, month, 0).getDate();
  useEffect(() => {
    if (day > daysInMonth) setDay(daysInMonth);
  }, [year, month, daysInMonth, day]);

  const confirm = () => onConfirm(`${year}-${pad(month)}-${pad(day)}`);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
        <View style={[styles.dialog, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.title, { color: colors.text }]}>目标完成日期</Text>
          <View style={styles.wheels}>
            <Wheel options={years} selected={year} label="年" onSelect={setYear} />
            <Wheel options={range(1, 12)} selected={month} label="月" onSelect={setMonth} />
            <Wheel options={range(1, daysInMonth)} selected={day} label="日" onSelect={setDay} />
          </View>
          {/* 中央选中指示条 */}
          <View pointerEvents="none" style={[styles.indicator, { borderColor: colors.tint, top: 82 }]} />
          <View style={styles.btnRow}>
            <TouchableOpacity style={[styles.btn, { backgroundColor: colors.background }]} onPress={() => onConfirm(null)}>
              <Text style={{ color: colors.subtitle, fontSize: 14, fontWeight: '600' }}>清除</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, { backgroundColor: colors.background }]} onPress={onClose}>
              <Text style={{ color: colors.text, fontSize: 14, fontWeight: '600' }}>取消</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.btn, { backgroundColor: colors.tint }]} onPress={confirm}>
              <Text style={{ color: '#0D0D0D', fontSize: 14, fontWeight: '700' }}>确定</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const wheelStyles = StyleSheet.create({
  wrap: { flex: 1 },
});

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', padding: 24 },
  dialog: { borderRadius: 14, borderWidth: 1, padding: 20 },
  title: { fontSize: 17, fontWeight: '700', marginBottom: 12, textAlign: 'center' },
  wheels: { flexDirection: 'row' },
  indicator: { position: 'absolute', left: 16, right: 16, height: ITEM_H, borderTopWidth: 1.5, borderBottomWidth: 1.5 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btn: { flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 10 },
});
