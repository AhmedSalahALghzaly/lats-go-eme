/**
 * Auth Store - Handles authentication state
 * Split from monolithic appStore for better performance
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type UserRole = 'guest' | 'user' | 'subscriber' | 'admin' | 'partner' | 'owner';

export interface User {
  id: string;
  email: string;
  name: string;
  picture?: string;
  is_admin?: boolean;
  role?: UserRole;
}

interface AuthState {
  user: User | null;
  sessionToken: string | null;
  isAuthenticated: boolean;
  userRole: UserRole;
  _hasHydrated: boolean;

  // Actions
  setUser: (user: User | null, token?: string | null) => void;
  setSessionToken: (token: string | null) => void;
  setUserRole: (role: UserRole) => void;
  setHasHydrated: (hydrated: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      sessionToken: null,
      isAuthenticated: false,
      userRole: 'guest',
      _hasHydrated: false,

      setUser: (user, token = null) => {
        set({
          user,
          sessionToken: token || get().sessionToken,
          isAuthenticated: !!user,
          userRole: user?.role || 'user',
        });
      },

      setSessionToken: (token) => set({ sessionToken: token }),

      setUserRole: (role) => set({ userRole: role }),

      setHasHydrated: (hydrated) => set({ _hasHydrated: hydrated }),

      logout: () => {
        set({
          user: null,
          sessionToken: null,
          isAuthenticated: false,
          userRole: 'guest',
        });
      },
    }),
    {
      name: 'alghazaly-auth-store',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        user: state.user,
        sessionToken: state.sessionToken,
        isAuthenticated: state.isAuthenticated,
        userRole: state.userRole,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.setHasHydrated(true);
        }
      },
    }
  )
);

// Selectors
export const useUser = () => useAuthStore((state) => state.user);
export const useIsAuthenticated = () => useAuthStore((state) => state.isAuthenticated);
export const useUserRole = () => useAuthStore((state) => state.userRole);
export const useHasHydrated = () => useAuthStore((state) => state._hasHydrated);

export const useCanAccessOwnerInterface = () => {
  const userRole = useAuthStore((state) => state.userRole);
  return userRole === 'owner' || userRole === 'partner';
};

export const useCanAccessAdminPanel = () => {
  const userRole = useAuthStore((state) => state.userRole);
  return ['owner', 'partner', 'admin'].includes(userRole);
};

export default useAuthStore;
