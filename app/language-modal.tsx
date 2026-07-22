import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  TouchableOpacity,
  View,
  Text,
  FlatList,
} from 'react-native';
import { router } from 'expo-router';
import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import useColors from '@/components/useColors';
import { LANGUAGES, LanguageConfig } from '@/lib/languages';
import { getSelectedLanguage, setSelectedLanguage } from '@/lib/database';

export default function LanguageModal() {
  const [currentCode, setCurrentCode] = useState('zh-CN');
  const colors = useColors();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    getSelectedLanguage().then(setCurrentCode);
  }, []);

  const handleSelect = async (lang: LanguageConfig) => {
    await setSelectedLanguage(lang.code);
    if (router.canDismiss()) router.dismiss();
    else router.back();
  };

  const closeModal = () => {
    if (router.canDismiss()) router.dismiss();
    else router.back();
  };

  const renderItem = ({ item }: { item: LanguageConfig }) => {
    const isSelected = item.code === currentCode;
    return (
      <TouchableOpacity
        style={[
          styles.row,
          {
            backgroundColor: isSelected ? colors.card : 'transparent',
            borderColor: isSelected ? colors.tint : 'transparent',
            borderWidth: isSelected ? 1 : 0,
          },
        ]}
        onPress={() => handleSelect(item)}
        activeOpacity={0.6}
      >
        <Text style={styles.flag}>{item.flag}</Text>
        <View style={styles.labelColumn}>
          <Text style={[styles.nativeName, { color: colors.text }]}>
            {item.nativeName}
          </Text>
          <Text style={[styles.englishName, { color: colors.subtitle }]}>
            {item.name}
          </Text>
        </View>
        {isSelected && (
          <FontAwesome name="check" size={16} color={colors.tint} />
        )}
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.wrapper, { backgroundColor: colors.background }]}>
      <View style={[styles.dragHandleRow, { paddingTop: insets.top + 8 }]}>
        <View style={[styles.dragHandle, { backgroundColor: colors.border }]} />
      </View>

      <View style={styles.headerRow}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          Choose Language
        </Text>
        <TouchableOpacity
          onPress={closeModal}
          style={styles.closeButton}
          activeOpacity={0.6}
        >
          <FontAwesome name="times" size={22} color={colors.subtitle} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={LANGUAGES}
        keyExtractor={(item) => item.code}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  dragHandleRow: {
    alignItems: 'center',
    paddingBottom: 4,
  },
  dragHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 14,
    marginVertical: 3,
  },
  flag: {
    fontSize: 28,
    marginRight: 14,
  },
  labelColumn: {
    flex: 1,
  },
  nativeName: {
    fontSize: 17,
    fontWeight: '600',
  },
  englishName: {
    fontSize: 13,
    marginTop: 2,
  },
});
