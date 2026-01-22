/**
 * Suppliers Management - Refactored with TanStack Query + FlashList
 * High-performance, stable architecture with optimistic updates
 * FIXED: Hooks order issue - all hooks are called before any conditional returns
 */
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  RefreshControl,
  Image,
  Linking,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '../../src/store/appStore';
import { useTheme } from '../../src/hooks/useTheme';
import { supplierApi, productBrandApi } from '../../src/services/api';
import { VoidDeleteGesture } from '../../src/components/ui/VoidDeleteGesture';
import { ErrorCapsule } from '../../src/components/ui/ErrorCapsule';
import { ConfettiEffect } from '../../src/components/ui/ConfettiEffect';
import { ImageUploader } from '../../src/components/ui/ImageUploader';
import { Toast } from '../../src/components/ui/FormFeedback';
import { BrandCardHorizontal } from '../../src/components/BrandCardHorizontal';
import { queryKeys } from '../../src/lib/queryClient';

type ViewMode = 'list' | 'add' | 'edit' | 'profile';

interface Supplier {
  id: string;
  name: string;
  name_ar?: string;
  phone?: string;
  address?: string;
  address_ar?: string;
  description?: string;
  description_ar?: string;
  website?: string;
  contact_email?: string;
  profile_image?: string;
  images?: string[];
  linked_brands?: string[];
  linked_product_brand_ids?: string[];
  created_at?: string;
}

// Memoized Supplier List Item
const SupplierListItem = React.memo(({
  supplier,
  colors,
  isRTL,
  language,
  isOwnerOrAdmin,
  onPress,
  onEdit,
  onDelete,
}: {
  supplier: Supplier;
  colors: any;
  isRTL: boolean;
  language: string;
  isOwnerOrAdmin: boolean;
  onPress: (supplier: Supplier) => void;
  onEdit: (supplier: Supplier) => void;
  onDelete: (id: string) => void;
}) => {
  const displayName = isRTL && supplier.name_ar ? supplier.name_ar : supplier.name;
  
  return (
    <VoidDeleteGesture onDelete={() => onDelete(supplier.id)} enabled={isOwnerOrAdmin}>
      <TouchableOpacity
        style={[styles.supplierCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => onPress(supplier)}
        activeOpacity={0.7}
      >
        <View style={[styles.supplierCardContent, isRTL && styles.cardRTL]}>
          {supplier.profile_image ? (
            <Image source={{ uri: supplier.profile_image }} style={styles.supplierImage} />
          ) : (
            <View style={[styles.supplierImagePlaceholder, { backgroundColor: colors.primary + '20' }]}>
              <Ionicons name="business" size={28} color={colors.primary} />
            </View>
          )}
          <View style={[styles.supplierInfo, isRTL && styles.infoRTL]}>
            <Text style={[styles.supplierName, { color: colors.text }]} numberOfLines={1}>
              {displayName}
            </Text>
            {supplier.phone && (
              <View style={[styles.supplierMeta, isRTL && styles.metaRTL]}>
                <Ionicons name="call" size={14} color={colors.textSecondary} />
                <Text style={[styles.supplierMetaText, { color: colors.textSecondary }]}>
                  {supplier.phone}
                </Text>
              </View>
            )}
            {supplier.address && (
              <View style={[styles.supplierMeta, isRTL && styles.metaRTL]}>
                <Ionicons name="location" size={14} color={colors.textSecondary} />
                <Text style={[styles.supplierMetaText, { color: colors.textSecondary }]} numberOfLines={1}>
                  {isRTL && supplier.address_ar ? supplier.address_ar : supplier.address}
                </Text>
              </View>
            )}
          </View>
          <Ionicons name={isRTL ? 'chevron-back' : 'chevron-forward'} size={20} color={colors.textSecondary} />
        </View>
      </TouchableOpacity>
    </VoidDeleteGesture>
  );
});

export default function SuppliersScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ viewMode?: string; id?: string }>();
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const queryClient = useQueryClient();
  const language = useAppStore((state) => state.language);
  const productBrands = useAppStore((state) => state.productBrands);
  const user = useAppStore((state) => state.user);
  const isRTL = language === 'ar';
  
  const isOwnerOrAdmin = user?.role === 'owner' || user?.role === 'admin' || user?.is_admin;

  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [error, setError] = useState<string | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);
  const [selectedSupplier, setSelectedSupplier] = useState<Supplier | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    address: '',
    description: '',
    website: '',
    contact_email: '',
    profile_image: '',
    images: [] as string[],
    linked_brands: [] as string[],
  });

  // Toast state
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const [toastType, setToastType] = useState<'success' | 'error' | 'warning' | 'info'>('success');

  // TanStack Query: Fetch Suppliers
  const {
    data: suppliersData,
    isLoading,
    isRefetching,
    refetch,
  } = useQuery({
    queryKey: queryKeys.suppliers.all,
    queryFn: async () => {
      const res = await supplierApi.getAll();
      return res.data || [];
    },
    staleTime: 2 * 60 * 1000,
  });

  const suppliers: Supplier[] = suppliersData || [];

  // Filter suppliers based on search
  const filteredSuppliers = useMemo(() => {
    if (!searchQuery.trim()) return suppliers;
    const query = searchQuery.toLowerCase();
    return suppliers.filter((s) => {
      const name = (s.name || '').toLowerCase();
      const nameAr = (s.name_ar || '').toLowerCase();
      const phone = (s.phone || '').toLowerCase();
      return name.includes(query) || nameAr.includes(query) || phone.includes(query);
    });
  }, [suppliers, searchQuery]);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'warning' | 'info' = 'success') => {
    setToastMessage(message);
    setToastType(type);
    setToastVisible(true);
  }, []);

  // Create Mutation
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await supplierApi.create(data);
      return res.data;
    },
    onSuccess: (newSupplier) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.all });
      setShowConfetti(true);
      showToast(isRTL ? 'تم إضافة المورد بنجاح' : 'Supplier added successfully', 'success');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      resetForm();
      setViewMode('list');
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || 'Failed to add supplier');
      showToast(err.response?.data?.detail || 'Failed to add supplier', 'error');
    },
  });

  // Update Mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await supplierApi.update(id, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.suppliers.all });
      showToast(isRTL ? 'تم تحديث المورد بنجاح' : 'Supplier updated successfully', 'success');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      resetForm();
      setViewMode('list');
      setSelectedSupplier(null);
    },
    onError: (err: any) => {
      setError(err.response?.data?.detail || 'Failed to update supplier');
      showToast(err.response?.data?.detail || 'Failed to update supplier', 'error');
    },
  });

  // Delete Mutation with Optimistic Update
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await supplierApi.delete(id);
      return id;
    },
    onMutate: async (deletedId) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.suppliers.all });
      const previousSuppliers = queryClient.getQueryData(queryKeys.suppliers.all);

      queryClient.setQueryData(queryKeys.suppliers.all, (old: Supplier[] | undefined) =>
        old ? old.filter(s => s.id !== deletedId) : []
      );

      return { previousSuppliers };
    },
    onSuccess: () => {
      showToast(isRTL ? 'تم حذف المورد بنجاح' : 'Supplier deleted successfully', 'success');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    onError: (err: any, variables, context) => {
      if (context?.previousSuppliers) {
        queryClient.setQueryData(queryKeys.suppliers.all, context.previousSuppliers);
      }
      setError(err.response?.data?.detail || 'Failed to delete supplier');
      showToast(err.response?.data?.detail || 'Failed to delete supplier', 'error');
    },
  });

  // Handle URL params for direct navigation to profile
  useEffect(() => {
    const handleProfileNavigation = async () => {
      if (params.viewMode === 'profile' && params.id) {
        // First check if supplier exists in current data
        let supplier = suppliers.find((s) => s.id === params.id);
        
        // If not found and we have data, try fetching directly
        if (!supplier && !isLoading) {
          try {
            const res = await supplierApi.getById(params.id);
            if (res.data) {
              supplier = res.data;
            }
          } catch (err) {
            console.error('Error fetching supplier:', err);
          }
        }
        
        if (supplier) {
          setSelectedSupplier(supplier);
          setViewMode('profile');
        }
      }
    };
    
    handleProfileNavigation();
  }, [params.viewMode, params.id, suppliers, isLoading]);

  const resetForm = useCallback(() => {
    setFormData({
      name: '',
      phone: '',
      address: '',
      description: '',
      website: '',
      contact_email: '',
      profile_image: '',
      images: [],
      linked_brands: [],
    });
  }, []);

  const handleAddSupplier = useCallback(() => {
    if (!formData.name.trim()) {
      setError(isRTL ? 'الاسم مطلوب' : 'Name is required');
      return;
    }
    createMutation.mutate(formData);
  }, [formData, isRTL, createMutation]);

  const handleUpdateSupplier = useCallback(() => {
    if (!selectedSupplier) return;
    updateMutation.mutate({ id: selectedSupplier.id, data: formData });
  }, [selectedSupplier, formData, updateMutation]);

  const handleDeleteSupplier = useCallback((supplierId: string) => {
    deleteMutation.mutate(supplierId);
  }, [deleteMutation]);

  const openEditMode = useCallback((supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setFormData({
      name: supplier.name || '',
      phone: supplier.phone || '',
      address: supplier.address || '',
      description: supplier.description || '',
      website: supplier.website || '',
      contact_email: supplier.contact_email || '',
      profile_image: supplier.profile_image || '',
      images: supplier.images || [],
      linked_brands: supplier.linked_brands || [],
    });
    setViewMode('edit');
  }, []);

  const openProfileMode = useCallback((supplier: Supplier) => {
    setSelectedSupplier(supplier);
    setViewMode('profile');
  }, []);

  const toggleBrandLink = useCallback((brandId: string) => {
    setFormData(prev => ({
      ...prev,
      linked_brands: prev.linked_brands.includes(brandId)
        ? prev.linked_brands.filter(id => id !== brandId)
        : [...prev.linked_brands, brandId],
    }));
  }, []);

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  const isSaving = createMutation.isPending || updateMutation.isPending;

  // ============================================================================
  // CRITICAL: All useCallback hooks must be defined BEFORE any conditional returns
  // ============================================================================

  // List Header Component
  const ListHeaderComponent = useCallback(() => (
    <View>
      {/* Header */}
      <View style={[styles.listHeader, { paddingTop: insets.top }]}>
        <View style={[styles.headerRow, isRTL && styles.headerRTL]}>
          <TouchableOpacity 
            style={[styles.backButton, { backgroundColor: colors.surface }]} 
            onPress={() => router.back()}
          >
            <Ionicons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.text }]}>
            {isRTL ? 'الموردون' : 'Suppliers'}
          </Text>
          {isOwnerOrAdmin && (
            <TouchableOpacity 
              style={[styles.addButton, { backgroundColor: colors.primary }]} 
              onPress={() => setViewMode('add')}
            >
              <Ionicons name="add" size={24} color="#FFF" />
            </TouchableOpacity>
          )}
        </View>

        {/* Search Bar */}
        <View style={[styles.searchContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Ionicons name="search" size={20} color={colors.textSecondary} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={isRTL ? 'ابحث عن مورد...' : 'Search suppliers...'}
            placeholderTextColor={colors.textSecondary}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Ionicons name="close-circle" size={20} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Stats */}
        <View style={[styles.statsCard, { backgroundColor: colors.primary }]}>
          <Text style={styles.statsValue}>{filteredSuppliers.length}</Text>
          <Text style={styles.statsLabel}>
            {isRTL ? 'إجمالي الموردين' : 'Total Suppliers'}
          </Text>
        </View>
      </View>
    </View>
  ), [insets.top, isRTL, colors, isOwnerOrAdmin, searchQuery, filteredSuppliers.length, router]);

  // Empty component
  const ListEmptyComponent = useCallback(() => (
    <View style={styles.emptyContainer}>
      {isLoading ? (
        <ActivityIndicator size="large" color={colors.primary} />
      ) : (
        <>
          <Ionicons name="business-outline" size={64} color={colors.textSecondary} />
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {searchQuery 
              ? (isRTL ? 'لا توجد نتائج' : 'No results found')
              : (isRTL ? 'لا يوجد موردون' : 'No suppliers found')
            }
          </Text>
        </>
      )}
    </View>
  ), [isLoading, colors, searchQuery, isRTL]);

  // Render item
  const renderItem = useCallback(({ item }: { item: Supplier }) => (
    <SupplierListItem
      supplier={item}
      colors={colors}
      isRTL={isRTL}
      language={language}
      isOwnerOrAdmin={isOwnerOrAdmin}
      onPress={openProfileMode}
      onEdit={openEditMode}
      onDelete={handleDeleteSupplier}
    />
  ), [colors, isRTL, language, isOwnerOrAdmin, openProfileMode, openEditMode, handleDeleteSupplier]);

  const keyExtractor = useCallback((item: Supplier) => item.id, []);

  // ============================================================================
  // NOW we can have conditional returns (after all hooks are defined)
  // ============================================================================

  // Profile View
  if (viewMode === 'profile' && selectedSupplier) {
    const linkedBrandObjects = productBrands.filter((b: any) => 
      (selectedSupplier.linked_product_brand_ids || selectedSupplier.linked_brands || []).includes(b.id)
    );
    const displayName = isRTL && selectedSupplier.name_ar ? selectedSupplier.name_ar : selectedSupplier.name;
    const displayAddress = isRTL && selectedSupplier.address_ar ? selectedSupplier.address_ar : selectedSupplier.address;
    const displayDescription = isRTL && selectedSupplier.description_ar ? selectedSupplier.description_ar : selectedSupplier.description;

    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <ScrollView style={styles.scrollView} contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top }]}>
          {/* Header */}
          <View style={[styles.profileHeader, isRTL && styles.headerRTL]}>
            <TouchableOpacity 
              style={[styles.profileBackButton, { backgroundColor: colors.surface }]} 
              onPress={() => { setViewMode('list'); setSelectedSupplier(null); router.setParams({ viewMode: undefined, id: undefined }); }}
            >
              <Ionicons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={24} color={colors.text} />
            </TouchableOpacity>
            <Text style={[styles.profileHeaderTitle, { color: colors.text }]}>{displayName}</Text>
            {isOwnerOrAdmin && (
              <TouchableOpacity 
                style={[styles.profileEditButton, { backgroundColor: colors.primary }]} 
                onPress={() => router.push(`/owner/add-entity-form?entityType=supplier&id=${selectedSupplier.id}`)}
              >
                <Ionicons name="pencil" size={20} color="#FFF" />
              </TouchableOpacity>
            )}
          </View>

          {/* Profile Image */}
          <View style={styles.profileImageContainerThemed}>
            {selectedSupplier.profile_image ? (
              <Image source={{ uri: selectedSupplier.profile_image }} style={styles.profileImageThemed} />
            ) : (
              <View style={[styles.profileImagePlaceholder, { backgroundColor: colors.surface }]}>
                <Ionicons name="business" size={60} color={colors.textSecondary} />
              </View>
            )}
          </View>

          {/* Info Cards */}
          <View style={styles.infoSection}>
            {selectedSupplier.phone && (
              <TouchableOpacity
                style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => Linking.openURL(`tel:${selectedSupplier.phone}`)}
              >
                <Ionicons name="call" size={22} color={colors.primary} />
                <Text style={[styles.infoCardText, { color: colors.text }]}>{selectedSupplier.phone}</Text>
              </TouchableOpacity>
            )}
            {displayAddress && (
              <View style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Ionicons name="location" size={22} color={colors.primary} />
                <Text style={[styles.infoCardText, { color: colors.text }]}>{displayAddress}</Text>
              </View>
            )}
            {selectedSupplier.contact_email && (
              <TouchableOpacity
                style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => Linking.openURL(`mailto:${selectedSupplier.contact_email}`)}
              >
                <Ionicons name="mail" size={22} color={colors.primary} />
                <Text style={[styles.infoCardText, { color: colors.text }]}>{selectedSupplier.contact_email}</Text>
              </TouchableOpacity>
            )}
            {selectedSupplier.website && (
              <TouchableOpacity
                style={[styles.infoCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => Linking.openURL(selectedSupplier.website!.startsWith('http') ? selectedSupplier.website! : `https://${selectedSupplier.website}`)}
              >
                <Ionicons name="globe" size={22} color={colors.primary} />
                <Text style={[styles.infoCardText, { color: colors.text }]}>{selectedSupplier.website}</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Description */}
          {displayDescription && (
            <View style={[styles.descriptionSection, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {isRTL ? 'الوصف' : 'Description'}
              </Text>
              <Text style={[styles.descriptionText, { color: colors.textSecondary }]}>{displayDescription}</Text>
            </View>
          )}

          {/* Linked Brands */}
          {linkedBrandObjects.length > 0 && (
            <View style={styles.brandsSection}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                {isRTL ? 'الماركات المرتبطة' : 'Linked Brands'}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.brandsScroll}>
                {linkedBrandObjects.map((brand: any) => (
                  <BrandCardHorizontal key={brand.id} brand={brand} />
                ))}
              </ScrollView>
            </View>
          )}
        </ScrollView>

        <Toast
          visible={toastVisible}
          message={toastMessage}
          type={toastType}
          onDismiss={() => setToastVisible(false)}
        />
      </View>
    );
  }

  // Add/Edit Form View
  if (viewMode === 'add' || viewMode === 'edit') {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView 
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView style={styles.scrollView} contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top }]}>
            {/* Header */}
            <View style={[styles.formHeader, isRTL && styles.headerRTL]}>
              <TouchableOpacity 
                style={[styles.backButton, { backgroundColor: colors.surface }]} 
                onPress={() => { setViewMode('list'); resetForm(); setSelectedSupplier(null); }}
              >
                <Ionicons name={isRTL ? 'arrow-forward' : 'arrow-back'} size={24} color={colors.text} />
              </TouchableOpacity>
              <Text style={[styles.formHeaderTitle, { color: colors.text }]}>
                {viewMode === 'add' 
                  ? (isRTL ? 'إضافة مورد' : 'Add Supplier')
                  : (isRTL ? 'تعديل المورد' : 'Edit Supplier')
                }
              </Text>
              <View style={{ width: 40 }} />
            </View>

            {/* Profile Image */}
            <View style={styles.formGroup}>
              <ImageUploader
                mode="single"
                value={formData.profile_image}
                onChange={(img) => setFormData(prev => ({ ...prev, profile_image: img as string }))}
                size="large"
                shape="circle"
                label={isRTL ? 'صورة المورد' : 'Supplier Image'}
              />
            </View>

            {/* Name */}
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.text }]}>
                {isRTL ? 'الاسم *' : 'Name *'}
              </Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                value={formData.name}
                onChangeText={(text) => setFormData(prev => ({ ...prev, name: text }))}
                placeholder={isRTL ? 'اسم المورد' : 'Supplier name'}
                placeholderTextColor={colors.textSecondary}
              />
            </View>

            {/* Phone */}
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.text }]}>
                {isRTL ? 'رقم الهاتف' : 'Phone'}
              </Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                value={formData.phone}
                onChangeText={(text) => setFormData(prev => ({ ...prev, phone: text }))}
                placeholder={isRTL ? 'رقم الهاتف' : 'Phone number'}
                placeholderTextColor={colors.textSecondary}
                keyboardType="phone-pad"
              />
            </View>

            {/* Email */}
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.text }]}>
                {isRTL ? 'البريد الإلكتروني' : 'Email'}
              </Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                value={formData.contact_email}
                onChangeText={(text) => setFormData(prev => ({ ...prev, contact_email: text }))}
                placeholder={isRTL ? 'البريد الإلكتروني' : 'Email address'}
                placeholderTextColor={colors.textSecondary}
                keyboardType="email-address"
                autoCapitalize="none"
              />
            </View>

            {/* Website */}
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.text }]}>
                {isRTL ? 'الموقع الإلكتروني' : 'Website'}
              </Text>
              <TextInput
                style={[styles.input, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                value={formData.website}
                onChangeText={(text) => setFormData(prev => ({ ...prev, website: text }))}
                placeholder="https://example.com"
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="none"
              />
            </View>

            {/* Address */}
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.text }]}>
                {isRTL ? 'العنوان' : 'Address'}
              </Text>
              <TextInput
                style={[styles.input, styles.textArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                value={formData.address}
                onChangeText={(text) => setFormData(prev => ({ ...prev, address: text }))}
                placeholder={isRTL ? 'العنوان' : 'Address'}
                placeholderTextColor={colors.textSecondary}
                multiline
                numberOfLines={3}
              />
            </View>

            {/* Description */}
            <View style={styles.formGroup}>
              <Text style={[styles.label, { color: colors.text }]}>
                {isRTL ? 'الوصف' : 'Description'}
              </Text>
              <TextInput
                style={[styles.input, styles.textArea, { backgroundColor: colors.surface, borderColor: colors.border, color: colors.text }]}
                value={formData.description}
                onChangeText={(text) => setFormData(prev => ({ ...prev, description: text }))}
                placeholder={isRTL ? 'وصف المورد' : 'Description'}
                placeholderTextColor={colors.textSecondary}
                multiline
                numberOfLines={4}
              />
            </View>

            {/* Save Button */}
            <TouchableOpacity
              style={[styles.saveButton, { backgroundColor: colors.primary }]}
              onPress={viewMode === 'add' ? handleAddSupplier : handleUpdateSupplier}
              disabled={isSaving}
            >
              {isSaving ? (
                <ActivityIndicator color="#FFF" />
              ) : (
                <>
                  <Ionicons name={viewMode === 'add' ? 'add' : 'checkmark'} size={20} color="#FFF" />
                  <Text style={styles.saveButtonText}>
                    {viewMode === 'add' 
                      ? (isRTL ? 'إضافة المورد' : 'Add Supplier')
                      : (isRTL ? 'حفظ التغييرات' : 'Save Changes')
                    }
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>

        {error && (
          <ErrorCapsule
            message={error}
            onDismiss={() => setError(null)}
          />
        )}

        <Toast
          visible={toastVisible}
          message={toastMessage}
          type={toastType}
          onDismiss={() => setToastVisible(false)}
        />
      </View>
    );
  }

  // Main List View
  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlashList
        data={filteredSuppliers}
        renderItem={renderItem}
        keyExtractor={keyExtractor}
        estimatedItemSize={90}
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
        extraData={[colors, searchQuery]}
      />

      {error && (
        <ErrorCapsule
          message={error}
          onDismiss={() => setError(null)}
          onRetry={refetch}
        />
      )}

      {showConfetti && (
        <ConfettiEffect onComplete={() => setShowConfetti(false)} />
      )}

      <Toast
        visible={toastVisible}
        message={toastMessage}
        type={toastType}
        onDismiss={() => setToastVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  keyboardView: { flex: 1 },
  scrollView: { flex: 1 },
  scrollContent: { paddingBottom: 100 },
  listContentContainer: { paddingHorizontal: 16, paddingBottom: 100 },
  listHeader: { marginBottom: 16 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  headerRTL: { flexDirection: 'row-reverse' },
  backButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 24, fontWeight: '700' },
  addButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
    gap: 10,
  },
  searchInput: { flex: 1, fontSize: 15, paddingVertical: 0 },
  statsCard: { borderRadius: 16, padding: 20, alignItems: 'center' },
  statsValue: { fontSize: 32, fontWeight: '700', color: '#FFF' },
  statsLabel: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginTop: 4 },
  supplierCard: { borderRadius: 12, borderWidth: 1, marginBottom: 12, overflow: 'hidden' },
  supplierCardContent: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  cardRTL: { flexDirection: 'row-reverse' },
  supplierImage: { width: 56, height: 56, borderRadius: 28 },
  supplierImagePlaceholder: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  supplierInfo: { flex: 1, marginLeft: 12 },
  infoRTL: { marginLeft: 0, marginRight: 12, alignItems: 'flex-end' },
  supplierName: { fontSize: 16, fontWeight: '600' },
  supplierMeta: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 },
  metaRTL: { flexDirection: 'row-reverse' },
  supplierMetaText: { fontSize: 13 },
  emptyContainer: { alignItems: 'center', padding: 60 },
  emptyText: { fontSize: 16, marginTop: 16 },
  // Profile styles
  profileHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 20 },
  profileBackButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  profileHeaderTitle: { fontSize: 20, fontWeight: '700', flex: 1, textAlign: 'center' },
  profileEditButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  profileImageContainerThemed: { alignItems: 'center', marginBottom: 24 },
  profileImageThemed: { width: 120, height: 120, borderRadius: 60 },
  profileImagePlaceholder: { width: 120, height: 120, borderRadius: 60, alignItems: 'center', justifyContent: 'center' },
  infoSection: { paddingHorizontal: 16, gap: 12 },
  infoCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12, borderWidth: 1, gap: 12 },
  infoCardText: { fontSize: 15, flex: 1 },
  descriptionSection: { marginHorizontal: 16, marginTop: 20, padding: 16, borderRadius: 12, borderWidth: 1 },
  sectionTitle: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
  descriptionText: { fontSize: 14, lineHeight: 22 },
  brandsSection: { marginTop: 20, paddingHorizontal: 16 },
  brandsScroll: { marginTop: 12 },
  // Form styles
  formHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 24 },
  formHeaderTitle: { fontSize: 20, fontWeight: '700' },
  formGroup: { paddingHorizontal: 16, marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', marginBottom: 8 },
  input: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 16 },
  textArea: { height: 100, textAlignVertical: 'top' },
  saveButton: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginHorizontal: 16, padding: 16, borderRadius: 12, gap: 8, marginTop: 8 },
  saveButtonText: { color: '#FFF', fontSize: 16, fontWeight: '600' },
});
