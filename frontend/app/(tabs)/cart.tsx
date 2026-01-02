/**
 * Cart Tab - Unified Shopping Hub Entry Point
 * This replaces the old cart screen with the Universal Shopping & Management Hub
 */
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../src/hooks/useTheme';
import { UnifiedShoppingHub } from '../../src/components/UnifiedShoppingHub';
import { Header } from '../../src/components/Header';
import { useTranslation } from '../../src/hooks/useTranslation';

export default function CartScreen() {
  const { colors } = useTheme();
  const { language } = useTranslation();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header 
        title={language === 'ar' ? 'حسابي' : 'My Account'} 
        showBack={false} 
        showSearch={true} 
        showCart={false} 
      />
      <UnifiedShoppingHub initialTab="cart" />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
