/**
 * Customers Management Screen
 * View and manage all customers
 */
import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useAppStore } from '../../src/store/appStore';
import { ListItemSkeleton } from '../../src/components/ui/Skeleton';

export default function CustomersScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const language = useAppStore((state) => state.language);
  const customers = useAppStore((state) => state.customers);
  const isRTL = language === 'ar';

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#1E3A5F', '#2D5A8F', '#3D7ABF']}
        style={StyleSheet.absoluteFill}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top }]}
      >
        {/* Header */}
        <View style={[styles.header, isRTL && styles.headerRTL]}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
            <Ionicons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={24} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {isRTL ? 'العملاء' : 'Customers'}
          </Text>
          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>{customers.length}</Text>
          </View>
        </View>

        {/* Customer List */}
        <View style={styles.listContainer}>
          {customers.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="people-outline" size={64} color="rgba(255,255,255,0.5)" />
              <Text style={styles.emptyText}>
                {isRTL ? 'لا يوجد عملاء بعد' : 'No customers yet'}
              </Text>
            </View>
          ) : (
            customers.map((customer: any) => (
              <TouchableOpacity key={customer.id} style={styles.customerCard}>
                <BlurView intensity={15} tint="light" style={styles.cardBlur}>
                  <View style={styles.customerAvatar}>
                    <Ionicons name="person" size={24} color="#3B82F6" />
                  </View>
                  <View style={styles.customerInfo}>
                    <Text style={styles.customerName}>{customer.name || customer.email}</Text>
                    <Text style={styles.customerEmail}>{customer.email}</Text>
                  </View>
                  <Ionicons name="chevron-forward" size={20} color="rgba(255,255,255,0.5)" />
                </BlurView>
              </TouchableOpacity>
            ))
          )}
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
  headerBadge: { backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 12 },
  headerBadgeText: { color: '#FFF', fontWeight: '600' },
  listContainer: { marginTop: 16 },
  customerCard: { marginBottom: 12, borderRadius: 12, overflow: 'hidden' },
  cardBlur: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: 'rgba(255,255,255,0.1)' },
  customerAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(59,130,246,0.2)', alignItems: 'center', justifyContent: 'center' },
  customerInfo: { flex: 1, marginLeft: 12 },
  customerName: { fontSize: 16, fontWeight: '600', color: '#FFF' },
  customerEmail: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyText: { color: 'rgba(255,255,255,0.5)', fontSize: 16, marginTop: 16 },
});
