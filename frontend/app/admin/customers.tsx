/**
 * Customers Admin - Refactored with TanStack Query + FlashList
 * High-performance, stable architecture with optimistic updates
 */
import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Image, RefreshControl } from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTheme } from '../../src/hooks/useTheme';
import { useTranslation } from '../../src/hooks/useTranslation';
import { customersApi } from '../../src/services/api';
import api from '../../src/services/api';
import { Header } from '../../src/components/Header';
import { UnifiedShoppingHub } from '../../src/components/UnifiedShoppingHub';
import { NEON_NIGHT_THEME } from '../../src/store/appStore';
import { OrderStatusIndicator } from '../../src/components/ui/OrderStatusIndicator';
import { queryKeys } from '../../src/lib/queryClient';

interface Customer {
  id: string;
  user_id?: string;
  name?: string;
  email?: string;
  phone?: string;
  picture?: string;
  created_at?: string;
  status?: string;
}

// Memoized Customer List Item
const CustomerListItem = React.memo(({
  customer,
  colors,
  language,
  isRTL,
  orderStatus,
  formatDate,
  onOpenProfile,
  onViewOrders,
  onDelete,
}: {
  customer: Customer;
  colors: any;
  language: string;
  isRTL: boolean;
  orderStatus: { status: string; activeCount: number } | undefined;
  formatDate: (dateStr?: string) => string;
  onOpenProfile: (customer: Customer, tab: string) => void;
  onViewOrders: (customer: Customer) => void;
  onDelete: (id: string) => void;
}) => (
  <TouchableOpacity 
    style={[styles.customerItem, { borderColor: colors.border }]}
    onPress={() => onOpenProfile(customer, 'profile')}
    activeOpacity={0.7}
  >
    {/* Avatar */}
    <View style={[styles.avatar, { backgroundColor: NEON_NIGHT_THEME.primary + '20' }]}>
      {customer.picture ? (
        <Image source={{ uri: customer.picture }} style={styles.avatarImage} />
      ) : (
        <Text style={[styles.avatarText, { color: NEON_NIGHT_THEME.primary }]}>
          {(customer.name || customer.email || '?')[0].toUpperCase()}
        </Text>
      )}
    </View>

    {/* Customer Info */}
    <View style={styles.customerInfo}>
      <Text style={[styles.customerName, { color: colors.text }]}>
        {customer.name || customer.email?.split('@')[0] || 'Unknown'}
      </Text>
      <View style={[styles.customerMeta, isRTL && styles.rowReverse]}>
        <Ionicons name="mail-outline" size={12} color={colors.textSecondary} />
        <Text style={[styles.customerEmail, { color: colors.textSecondary }]} numberOfLines={1}>
          {customer.email}
        </Text>
      </View>
      {customer.phone && (
        <View style={[styles.customerMeta, isRTL && styles.rowReverse]}>
          <Ionicons name="call-outline" size={12} color={colors.textSecondary} />
          <Text style={[styles.customerPhone, { color: colors.textSecondary }]}>
            {customer.phone}
          </Text>
        </View>
      )}
      <Text style={[styles.customerDate, { color: colors.textSecondary }]}>
        {language === 'ar' ? 'انضم:' : 'Joined:'} {formatDate(customer.created_at)}
      </Text>
    </View>

    {/* Action Icons */}
    <View style={styles.actionIcons}>
      {/* Real-Time Order Status Indicator */}
      <View style={styles.statusIndicatorWrapper}>
        <OrderStatusIndicator 
          status={orderStatus?.status || 'no_active_order'}
          activeOrderCount={orderStatus?.activeCount || 0}
          size={24}
        />
      </View>

      {/* Quick Actions */}
      <TouchableOpacity 
        style={[styles.iconBtn, { backgroundColor: '#EF4444' + '20' }]}
        onPress={(e) => { e.stopPropagation(); onOpenProfile(customer, 'favorites'); }}
      >
        <Ionicons name="heart" size={16} color="#EF4444" />
      </TouchableOpacity>

      <TouchableOpacity 
        style={[styles.iconBtn, { backgroundColor: NEON_NIGHT_THEME.primary + '20' }]}
        onPress={(e) => { e.stopPropagation(); onOpenProfile(customer, 'cart'); }}
      >
        <Ionicons name="cart" size={16} color={NEON_NIGHT_THEME.primary} />
      </TouchableOpacity>

      <TouchableOpacity 
        style={[styles.iconBtn, { backgroundColor: '#10B981' + '20' }]}
        onPress={(e) => { e.stopPropagation(); onViewOrders(customer); }}
      >
        <Ionicons name="receipt" size={16} color="#10B981" />
      </TouchableOpacity>

      {/* View Details */}
      <TouchableOpacity 
        style={[styles.iconBtn, { backgroundColor: colors.surface }]}
        onPress={(e) => { e.stopPropagation(); onOpenProfile(customer, 'profile'); }}
      >
        <Ionicons name="eye" size={18} color={colors.text} />
      </TouchableOpacity>

      {/* Delete */}
      <TouchableOpacity
        style={[styles.iconBtn, { backgroundColor: colors.error + '20' }]}
        onPress={(e) => { e.stopPropagation(); onDelete(customer.user_id || customer.id); }}
      >
        <Ionicons name="trash" size={16} color={colors.error} />
      </TouchableOpacity>
    </View>
  </TouchableOpacity>
));

export default function CustomersAdmin() {
  const { colors } = useTheme();
  const { language, isRTL } = useTranslation();
  const router = useRouter();
  const params = useLocalSearchParams();
  const queryClient = useQueryClient();

  // Customer Profile State
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showProfile, setShowProfile] = useState(false);
  const [initialTab, setInitialTab] = useState('favorites');

  // TanStack Query: Fetch Customers
  const {
    data: customersResult,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: queryKeys.customers.all,
    queryFn: async () => {
      const response = await customersApi.getAll();
      const customersList = response.data?.customers || [];
      
      // Fetch order status for each customer
      const statusResults = await Promise.all(
        customersList.map(async (customer: Customer) => {
          const userId = customer.id;
          if (!userId) return { userId, count: 0, status: 'no_active_order', activeCount: 0 };
          
          try {
            const ordersRes = await api.get(`/customers/admin/customer/${userId}/orders`);
            const orders = ordersRes.data?.orders || [];
            
            const activeStatuses = ['pending', 'confirmed', 'preparing', 'shipped', 'out_for_delivery'];
            const activeOrders = orders.filter((o: any) => activeStatuses.includes(o.status));
            
            if (activeOrders.length > 0) {
              activeOrders.sort((a: any, b: any) => 
                new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
              );
              return {
                userId,
                count: activeOrders.length,
                status: activeOrders[0].status,
                activeCount: activeOrders.length,
              };
            } else {
              const latestOrder = orders[0];
              return {
                userId,
                count: 0,
                status: latestOrder?.status || 'no_active_order',
                activeCount: 0,
              };
            }
          } catch (e) {
            return { userId, count: 0, status: 'no_active_order', activeCount: 0 };
          }
        })
      );

      // Build status maps
      const counts: Record<string, number> = {};
      const statusMap: Record<string, { status: string; activeCount: number }> = {};
      
      statusResults.forEach((result) => {
        if (result.userId) {
          counts[result.userId] = result.count;
          statusMap[result.userId] = {
            status: result.status,
            activeCount: result.activeCount,
          };
        }
      });

      return {
        customers: customersList,
        pendingOrderCounts: counts,
        customerOrderStatus: statusMap,
      };
    },
    staleTime: 2 * 60 * 1000,
  });

  const customers: Customer[] = customersResult?.customers || [];
  const pendingOrderCounts = customersResult?.pendingOrderCounts || {};
  const customerOrderStatus = customersResult?.customerOrderStatus || {};

  // Delete Mutation with Optimistic Update
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await customersApi.delete(id);
      return id;
    },
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.customers.all });
      const previousData = queryClient.getQueryData(queryKeys.customers.all);

      queryClient.setQueryData(queryKeys.customers.all, (old: any) => {
        if (!old) return old;
        return {
          ...old,
          customers: old.customers.filter((c: Customer) => c.user_id !== deletedId && c.id !== deletedId),
        };
      });

      return { previousData };
    },
    onError: (err, variables, context) => {
      if (context?.previousData) {
        queryClient.setQueryData(queryKeys.customers.all, context.previousData);
      }
    },
  });

  // Handle customerId query param for direct navigation
  useEffect(() => {
    if (params.customerId && customers.length > 0) {
      const customer = customers.find(c => c.user_id === params.customerId || c.id === params.customerId);
      if (customer) {
        openCustomerProfile(customer, 'profile');
      }
    }
  }, [params.customerId, customers]);

  const openCustomerProfile = useCallback((customer: Customer, tab: string = 'profile') => {
    setSelectedCustomer(customer);
    setInitialTab(tab);
    setShowProfile(true);
  }, []);

  const handleViewOrders = useCallback((customer: Customer) => {
    openCustomerProfile(customer, 'orders');
  }, [openCustomerProfile]);

  const handleDelete = useCallback((id: string) => {
    deleteMutation.mutate(id);
  }, [deleteMutation]);

  const formatDate = useCallback((dateStr?: string) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString(language === 'ar' ? 'ar-EG' : 'en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, [language]);

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  // List Header Component - MUST be declared before any conditional rendering
  const ListHeaderComponent = useCallback(() => (
    <View>
      {/* Breadcrumb */}
      <View style={[styles.breadcrumb, isRTL && styles.breadcrumbRTL]}>
        <TouchableOpacity onPress={() => router.push('/admin')}>
          <Text style={[styles.breadcrumbText, { color: colors.primary }]}>
            {language === 'ar' ? 'لوحة التحكم' : 'Admin'}
          </Text>
        </TouchableOpacity>
        <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={16} color={colors.textSecondary} />
        <Text style={[styles.breadcrumbText, { color: colors.textSecondary }]}>
          {language === 'ar' ? 'العملاء' : 'Customers'}
        </Text>
      </View>

      {/* Stats Card */}
      <View style={[styles.statsCard, { backgroundColor: NEON_NIGHT_THEME.primary }]}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{customers.length}</Text>
          <Text style={styles.statLabel}>
            {language === 'ar' ? 'إجمالي العملاء' : 'Total Customers'}
          </Text>
        </View>
        <View style={styles.statDivider} />
        <View style={styles.statItem}>
          <Text style={styles.statValue}>
            {Object.values(pendingOrderCounts).reduce((a: number, b: number) => a + b, 0)}
          </Text>
          <Text style={styles.statLabel}>
            {language === 'ar' ? 'طلبات معلقة' : 'Pending Orders'}
          </Text>
        </View>
      </View>

      {/* List Header */}
      <View style={[styles.listCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={[styles.listHeader, isRTL && styles.listHeaderRTL]}>
          <Text style={[styles.listTitle, { color: colors.text }]}>
            {language === 'ar' ? 'قائمة العملاء' : 'Customer List'}
          </Text>
          <TouchableOpacity onPress={onRefresh}>
            <Ionicons name="refresh" size={20} color={colors.primary} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  ), [isRTL, colors, language, customers.length, pendingOrderCounts, router, onRefresh]);

  // Empty component
  const ListEmptyComponent = useCallback(() => (
    <View style={styles.emptyContainer}>
      {isLoading ? (
        <ActivityIndicator size="large" color={colors.primary} />
      ) : (
        <>
          <Ionicons name="people-outline" size={48} color={colors.border} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {language === 'ar' ? 'لا يوجد عملاء' : 'No customers found'}
          </Text>
        </>
      )}
    </View>
  ), [isLoading, colors, language]);

  // Render item
  const renderItem = useCallback(({ item }: { item: Customer }) => (
    <CustomerListItem
      customer={item}
      colors={colors}
      language={language}
      isRTL={isRTL}
      orderStatus={customerOrderStatus[item.id]}
      formatDate={formatDate}
      onOpenProfile={openCustomerProfile}
      onViewOrders={handleViewOrders}
      onDelete={handleDelete}
    />
  ), [colors, language, isRTL, customerOrderStatus, formatDate, openCustomerProfile, handleViewOrders, handleDelete]);

  const keyExtractor = useCallback((item: Customer) => item.user_id || item.id, []);

  // Customer Profile Modal - Conditional rendering inside main return (fixes hooks violation)
  if (showProfile && selectedCustomer) {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
        <Header 
          title={selectedCustomer?.name || (language === 'ar' ? 'ملف العميل' : 'Customer Profile')} 
          showBack 
          showSearch={false} 
          showCart={false} 
        />
        <UnifiedShoppingHub
          customerId={selectedCustomer.id}
          customerData={selectedCustomer}
          isAdminView={true}
          onClose={() => {
            setShowProfile(false);
            setSelectedCustomer(null);
            refetch(); // Refresh list on close
          }}
          initialTab={initialTab}
        />
      </SafeAreaView>
    );
  }

  // Main Customer List View
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['bottom']}>
      <Header title={language === 'ar' ? 'العملاء' : 'Customers'} showBack showSearch={false} showCart={false} />

      <FlashList
        data={customers}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        estimatedItemSize={100}
        ListHeaderComponent={ListHeaderComponent}
        ListEmptyComponent={ListEmptyComponent}
        contentContainerStyle={styles.listContentContainer}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={onRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        extraData={customerOrderStatus}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  listContentContainer: { padding: 16 },
  breadcrumb: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 8 },
  breadcrumbRTL: { flexDirection: 'row-reverse' },
  breadcrumbText: { fontSize: 14 },
  statsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    padding: 20,
    borderRadius: 16,
    marginBottom: 16,
  },
  statItem: { alignItems: 'center' },
  statValue: { fontSize: 28, fontWeight: '700', color: '#FFF' },
  statLabel: { fontSize: 12, color: 'rgba(255,255,255,0.8)', marginTop: 4 },
  statDivider: { width: 1, height: 40, backgroundColor: 'rgba(255,255,255,0.3)' },
  listCard: { borderRadius: 12, borderWidth: 1, padding: 16 },
  listHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  listHeaderRTL: { flexDirection: 'row-reverse' },
  listTitle: { fontSize: 18, fontWeight: '700' },
  emptyContainer: { alignItems: 'center', padding: 40 },
  emptyText: { marginTop: 12, textAlign: 'center', fontSize: 15 },
  customerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: 52, height: 52, borderRadius: 26 },
  avatarText: { fontSize: 20, fontWeight: '700' },
  customerInfo: { flex: 1, marginLeft: 12 },
  customerName: { fontSize: 16, fontWeight: '600', marginBottom: 2 },
  customerMeta: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  rowReverse: { flexDirection: 'row-reverse' },
  customerEmail: { fontSize: 12 },
  customerPhone: { fontSize: 12 },
  customerDate: { fontSize: 11, marginTop: 4 },
  actionIcons: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  statusIndicatorWrapper: { marginRight: 4 },
  iconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
