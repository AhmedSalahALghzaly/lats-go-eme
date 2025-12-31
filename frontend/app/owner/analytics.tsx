/**
 * Analytics Dashboard Screen
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAppStore } from '../../src/store/appStore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function AnalyticsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const language = useAppStore((state) => state.language);
  const orders = useAppStore((state) => state.orders);
  const products = useAppStore((state) => state.products);
  const customers = useAppStore((state) => state.customers);
  const isRTL = language === 'ar';

  const totalRevenue = orders.reduce((sum: number, o: any) => sum + (o.total || 0), 0);
  const avgOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0;

  return (
    <View style={styles.container}>
      <LinearGradient colors={['#831843', '#BE185D', '#EC4899']} style={StyleSheet.absoluteFill} />
      <ScrollView style={styles.scrollView} contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top }]}>
        <View style={[styles.header, isRTL && styles.headerRTL]}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={24} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isRTL ? 'التحليلات' : 'Analytics'}</Text>
        </View>

        <View style={styles.statsGrid}>
          <View style={styles.statCard}>
            <BlurView intensity={15} tint="light" style={styles.statBlur}>
              <Ionicons name="cash" size={28} color="#10B981" />
              <Text style={styles.statValue}>{totalRevenue.toLocaleString()} ج.م</Text>
              <Text style={styles.statLabel}>{isRTL ? 'إجمالي الإيرادات' : 'Total Revenue'}</Text>
            </BlurView>
          </View>
          <View style={styles.statCard}>
            <BlurView intensity={15} tint="light" style={styles.statBlur}>
              <Ionicons name="receipt" size={28} color="#3B82F6" />
              <Text style={styles.statValue}>{orders.length}</Text>
              <Text style={styles.statLabel}>{isRTL ? 'إجمالي الطلبات' : 'Total Orders'}</Text>
            </BlurView>
          </View>
          <View style={styles.statCard}>
            <BlurView intensity={15} tint="light" style={styles.statBlur}>
              <Ionicons name="trending-up" size={28} color="#F59E0B" />
              <Text style={styles.statValue}>{avgOrderValue.toFixed(0)} ج.م</Text>
              <Text style={styles.statLabel}>{isRTL ? 'متوسط الطلب' : 'Avg Order'}</Text>
            </BlurView>
          </View>
          <View style={styles.statCard}>
            <BlurView intensity={15} tint="light" style={styles.statBlur}>
              <Ionicons name="cube" size={28} color="#8B5CF6" />
              <Text style={styles.statValue}>{products.length}</Text>
              <Text style={styles.statLabel}>{isRTL ? 'المنتجات' : 'Products'}</Text>
            </BlurView>
          </View>
        </View>

        <View style={{ height: insets.bottom + 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { paddingHorizontal: 16 },
  header: { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, gap: 12 },
  headerRTL: { flexDirection: 'row-reverse' },
  backButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1, fontSize: 24, fontWeight: '700', color: '#FFF' },
  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 16 },
  statCard: { width: (SCREEN_WIDTH - 44) / 2, aspectRatio: 1.2, borderRadius: 16, overflow: 'hidden' },
  statBlur: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)', padding: 16 },
  statValue: { fontSize: 24, fontWeight: '700', color: '#FFF', marginTop: 8 },
  statLabel: { fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 4, textAlign: 'center' },
});
