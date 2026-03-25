import { create } from 'zustand';

interface User {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
}

interface AppState {
  user: User | null;
  initialized: boolean;
  setUser: (user: User | null) => void;
  setInitialized: (initialized: boolean) => void;
}

export const useStore = create<AppState>((set) => ({
  user: null,
  initialized: false,
  setUser: (user) => set({ user }),
  setInitialized: (initialized) => set({ initialized }),
}));
