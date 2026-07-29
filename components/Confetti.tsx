import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

export default function Confetti({ visible, onEnd }: { visible: boolean; onEnd?: () => void }) {
  useEffect(() => { if (visible && onEnd) { const timer = setTimeout(onEnd, 1400); return () => clearTimeout(timer); } }, [visible, onEnd]);
  if (!visible) return null;
  return <View pointerEvents="none" style={styles.layer}>{Array.from({ length: 18 }, (_, index) => <View key={index} style={[styles.piece, { left: `${(index * 29) % 100}%`, top: `${(index * 17) % 62}%`, backgroundColor: ['#E5484D', '#30A46C', '#F5A623', '#3B82F6'][index % 4] }]} />)}</View>;
}

const styles = StyleSheet.create({ layer: { ...StyleSheet.absoluteFillObject, zIndex: 50 }, piece: { position: 'absolute', width: 7, height: 12, transform: [{ rotate: '25deg' }] } });
