/**
 * Data Cache Store - Handles cached data for offline-first
 * Split from monolithic appStore for better performance
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type SyncStatus = 'idle' | 'syncing' | 'success' | 'error';

interface DataCacheState {
  // Sync State
  syncStatus: SyncStatus;
  lastSyncTime: number | null;
  isOnline: boolean;
  syncError: string | null;

  // Data cache for offline-first
  carBrands: any[];
  carModels: any[];
  productBrands: any[];
  categories: any[];
  products: any[];
  suppliers: any[];
  distributors: any[];
  partners: any[];
  admins: any[];
  subscribers: any[];
  customers: any[];
  orders: any[];

  // Actions
  setOnline: (isOnline: boolean) => void;
  setSyncStatus: (status: SyncStatus) => void;
  setSyncError: (error: string | null) => void;
  setLastSyncTime: (time: number) => void;

  // Data Actions
  setCarBrands: (data: any[]) => void;
  setCarModels: (data: any[]) => void;
  setProductBrands: (data: any[]) => void;
  setCategories: (data: any[]) => void;
  setProducts: (data: any[]) => void;
  setSuppliers: (data: any[]) => void;
  setDistributors: (data: any[]) => void;
  setPartners: (data: any[]) => void;
  setAdmins: (data: any[]) => void;
  setSubscribers: (data: any[]) => void;
  setCustomers: (data: any[]) => void;
  setOrders: (data: any[]) => void;
}

export const useDataCacheStore = create<DataCacheState>()(
  persist(
    (set) => ({
      syncStatus: 'idle',
      lastSyncTime: null,
      isOnline: true,
      syncError: null,
      carBrands: [],
      carModels: [],
      productBrands: [],
      categories: [],
      products: [],
      suppliers: [],
      distributors: [],
      partners: [],
      admins: [],
      subscribers: [],
      customers: [],
      orders: [],

      setOnline: (isOnline) => set({ isOnline }),
      setSyncStatus: (status) => set({ syncStatus: status }),
      setSyncError: (error) => set({ syncError: error }),
      setLastSyncTime: (time) => set({ lastSyncTime: time }),

      setCarBrands: (data) => set({ carBrands: data }),
      setCarModels: (data) => set({ carModels: data }),
      setProductBrands: (data) => set({ productBrands: data }),
      setCategories: (data) => set({ categories: data }),
      setProducts: (data) => set({ products: data }),
      setSuppliers: (data) => set({ suppliers: data }),
      setDistributors: (data) => set({ distributors: data }),
      setPartners: (data) => set({ partners: data }),
      setAdmins: (data) => set({ admins: data }),
      setSubscribers: (data) => set({ subscribers: data }),
      setCustomers: (data) => set({ customers: data }),
      setOrders: (data) => set({ orders: data }),
    }),
    {
      name: 'alghazaly-data-cache',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        lastSyncTime: state.lastSyncTime,
        carBrands: state.carBrands,
        carModels: state.carModels,
        productBrands: state.productBrands,
        categories: state.categories,
        products: state.products,
        suppliers: state.suppliers,
        distributors: state.distributors,
      }),
    }
  )
);

// Selectors
export const useSyncStatus = () => useDataCacheStore((state) => state.syncStatus);
export const useIsOnline = () => useDataCacheStore((state) => state.isOnline);
export const useCarBrands = () => useDataCacheStore((state) => state.carBrands);
export const useCarModels = () => useDataCacheStore((state) => state.carModels);
export const useProductBrands = () => useDataCacheStore((state) => state.productBrands);
export const useCategories = () => useDataCacheStore((state) => state.categories);
export const useProducts = () => useDataCacheStore((state) => state.products);
export const useOrders = () => useDataCacheStore((state) => state.orders);

export default useDataCacheStore;
