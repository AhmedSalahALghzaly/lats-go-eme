import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Header } from '../src/components/Header';
import { useTheme } from '../src/hooks/useTheme';
import { useTranslation } from '../src/hooks/useTranslation';
import { useAppStore } from '../src/store/appStore';
import { favoritesApi, cartApi } from '../src/services/api';

interface FavoriteItem {
  id: string;
  user_id: string;
  product_id: string;
  created_at: string;
  product: {
    id: string;
    name: string;
    name_ar?: string;
    price: number;
    sku: string;
    image_url?: string;
    product_brand?: {
      id: string;
      name: string;
    };
    category?: {
      id: string;
      name: string;
      name_ar?: string;
    };
  };
}

export default function FavoritesScreen() {
  const { colors } = useTheme();
  const { t, isRTL, language } = useTranslation();
  const router = useRouter();
  const { user, addToLocalCart } = useAppStore();

  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [addingToCartId, setAddingToCartId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (user) {
        fetchFavorites();
      }
    }, [user])
  );

  const fetchFavorites = async () => {
    try {
      const response = await favoritesApi.getAll();
      setFavorites(response.data.favorites || []);
    } catch (error) {
      console.error('Error fetching favorites:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    fetchFavorites();
  };

  const handleRemoveFromFavorites = async (productId: string) => {
    // Remove directly without confirmation for better UX
    setRemovingId(productId);
    try {
      await favoritesApi.remove(productId);
      setFavorites((prev) => prev.filter(f => f.product_id !== productId));
    } catch (error) {
      console.error('Error removing from favorites:', error);
    } finally {
      setRemovingId(null);
    }
  };

  const handleAddToCart = async (item: FavoriteItem) => {
    setAddingToCartId(item.product_id);
    try {
      await cartApi.addItem(item.product_id, 1);
      addToLocalCart({ product_id: item.product_id, quantity: 1, product: item.product });
      Alert.alert('', (language === 'ar' ? 'تمت الإضافة إلى السلة' : 'Added to cart') + ' ✔');
    } catch (error) {
      console.error('Error adding to cart:', error);
      Alert.alert(t('error'));
    } finally {
      setAddingToCartId(null);
    }
  };

  const getName = (item: any, field: string = 'name') => {
    const arField = `${field}_ar`;
    return language === 'ar' && item?.[arField] ? item[arField] : item?.[field] || '';
  };

  if (!user) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title={language === 'ar' ? 'المفضلة' : 'My Favorites'} showBack={true} />
        <View style={styles.emptyContainer}>
          <Ionicons name="heart-outline" size={64} color={colors.textSecondary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {language === 'ar' ? 'تسجيل الدخول مطلوب' : 'Login Required'}
          </Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {language === 'ar' ? 'يرجى تسجيل الدخول لعرض المفضلة' : 'Please login to view your favorites'}
          </Text>
          <TouchableOpacity
            style={[styles.loginButton, { backgroundColor: colors.primary }]}
            onPress={() => router.push('/login')}
          >
            <Text style={styles.loginButtonText}>
              {language === 'ar' ? 'تسجيل الدخول' : 'Login'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title={language === 'ar' ? 'المفضلة' : 'My Favorites'} showBack={true} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  if (favorites.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Header title={language === 'ar' ? 'المفضلة' : 'My Favorites'} showBack={true} />
        <View style={styles.emptyContainer}>
          <Ionicons name="heart-outline" size={64} color={colors.textSecondary} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            {language === 'ar' ? 'لا توجد منتجات مفضلة' : 'No favorites yet'}
          </Text>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            {language === 'ar' 
              ? 'اضغط على أيقونة القلب في صفحة المنتج لإضافته إلى المفضلة'
              : 'Tap the heart icon on a product to add it to your favorites'}
          </Text>
          <TouchableOpacity
            style={[styles.browseButton, { backgroundColor: colors.primary }]}
            onPress={() => router.push('/')}
          >
            <Text style={styles.browseButtonText}>
              {language === 'ar' ? 'تصفح المنتجات' : 'Browse Products'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <Header title={language === 'ar' ? 'المفضلة' : 'My Favorites'} showBack={true} />
      
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {/* Favorites Count */}
        <View style={styles.header}>
          <Text style={[styles.countText, { color: colors.textSecondary }]}>
            {favorites.length} {language === 'ar' ? 'منتجات' : 'products'}
          </Text>
        </View>

        {/* Favorites List */}
        {favorites.map((item) => (
          <TouchableOpacity
            key={item.id}
            style={[styles.favoriteCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => router.push(`/product/${item.product_id}`)}
            activeOpacity={0.7}
          >
            {/* Product Image */}
            <View style={[styles.imageContainer, { backgroundColor: colors.surface }]}>
              {item.product.image_url ? (
                <Image
                  source={{ uri: item.product.image_url }}
                  style={styles.productImage}
                  resizeMode="cover"
                />
              ) : (
                <Ionicons name="cube-outline" size={40} color={colors.textSecondary} />
              )}
            </View>

            {/* Product Info */}
            <View style={styles.productInfo}>
              {/* Brand */}
              {item.product.product_brand && (
                <Text style={[styles.brandName, { color: colors.primary }]}>
                  {item.product.product_brand.name}
                </Text>
              )}

              {/* Name */}
              <Text style={[styles.productName, { color: colors.text }]} numberOfLines={2}>
                {getName(item.product)}
              </Text>

              {/* SKU */}
              <Text style={[styles.sku, { color: colors.textSecondary }]}>
                SKU: {item.product.sku}
              </Text>

              {/* Price */}
              <Text style={[styles.price, { color: colors.primary }]}>
                {item.product.price?.toFixed(2)} ج.م
              </Text>
            </View>

            {/* Actions */}
            <View style={styles.actions}>
              {/* Remove from Favorites */}
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: colors.error + '15' }]}
                onPress={(e) => {
                  e.stopPropagation();
                  handleRemoveFromFavorites(item.product_id);
                }}
                disabled={removingId === item.product_id}
              >
                {removingId === item.product_id ? (
                  <ActivityIndicator size="small" color={colors.error} />
                ) : (
                  <Ionicons name="heart-dislike" size={20} color={colors.error} />
                )}
              </TouchableOpacity>

              {/* Add to Cart */}
              <TouchableOpacity
                style={[styles.actionButton, { backgroundColor: colors.primary + '15' }]}
                onPress={(e) => {
                  e.stopPropagation();
                  handleAddToCart(item);
                }}
                disabled={addingToCartId === item.product_id}
              >
                {addingToCartId === item.product_id ? (
                  <ActivityIndicator size="small" color={colors.primary} />
                ) : (
                  <Ionicons name="cart-outline" size={20} color={colors.primary} />
                )}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        ))}

        {/* Bottom padding */}
        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    marginTop: 20,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 24,
  },
  loginButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  loginButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  browseButton: {
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  browseButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  header: {
    marginBottom: 16,
  },
  countText: {
    fontSize: 14,
  },
  favoriteCard: {
    flexDirection: 'row',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  imageContainer: {
    width: 90,
    height: 90,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  productInfo: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  brandName: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  productName: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  sku: {
    fontSize: 11,
    marginBottom: 6,
  },
  price: {
    fontSize: 18,
    fontWeight: '800',
  },
  actions: {
    justifyContent: 'space-around',
    paddingLeft: 8,
  },
  actionButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
