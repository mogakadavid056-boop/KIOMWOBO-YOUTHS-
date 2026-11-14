import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '@/src/lib/supabase';
import {
  type Church,
  DISTRICT_CHURCH_NAMES,
  type Profile,
  type UserRole,
} from '@/src/types/database';

interface SignUpPayload {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  gender: string;
  churchId: string;
  dateOfBirth: string;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  churches: Church[];
  loading: boolean;
  isConfigured: boolean;
  isAdmin: boolean;
  isDistrictAdmin: boolean;
  isSuperAdmin: boolean;
  isSuspended: boolean;
  role: UserRole;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (payload: SignUpPayload) => Promise<{ error: string | null; needsConfirmation?: boolean }>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const FALLBACK_CHURCHES: Church[] = DISTRICT_CHURCH_NAMES.map((name, idx) => ({
  id: `church-${idx + 1}`,
  name,
}));

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [churches, setChurches] = useState<Church[]>(FALLBACK_CHURCHES);
  const [loading, setLoading] = useState(true);

  const loadChurches = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    const { data, error } = await supabase.from('churches').select('*').order('name');
    if (!error && data && data.length > 0) {
      setChurches(data as Church[]);
    }
  }, []);

  const loadProfile = useCallback(async (uid: string) => {
    if (!isSupabaseConfigured) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('*, churches(*)')
      .eq('id', uid)
      .maybeSingle();

    if (!error && data) {
      setProfile(data as Profile);
      return;
    }

    // Graceful retry once in case database trigger is still completing right after signup
    await new Promise((r) => setTimeout(r, 600));
    const retry = await supabase
      .from('profiles')
      .select('*, churches(*)')
      .eq('id', uid)
      .maybeSingle();

    if (!retry.error && retry.data) {
      setProfile(retry.data as Profile);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user?.id) {
      await loadProfile(user.id);
    }
  }, [user?.id, loadProfile]);

  useEffect(() => {
    let active = true;

    async function init() {
      await loadChurches();

      if (!isSupabaseConfigured) {
        if (active) setLoading(false);
        return;
      }

      const {
        data: { session: initialSession },
      } = await supabase.auth.getSession();

      if (!active) return;
      setSession(initialSession);
      setUser(initialSession?.user ?? null);

      if (initialSession?.user) {
        await loadProfile(initialSession.user.id);
      }

      if (active) setLoading(false);
    }

    init();

    if (!isSupabaseConfigured) return;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (nextSession?.user) {
        loadProfile(nextSession.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [loadChurches, loadProfile]);

  const signIn = async (email: string, password: string) => {
    if (!isSupabaseConfigured) {
      return { error: 'Supabase environment variables (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY) are not configured.' };
    }
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return { error: error ? error.message : null };
  };

  const signUp = async ({
    email,
    password,
    fullName,
    phone,
    gender,
    churchId,
    dateOfBirth,
  }: SignUpPayload) => {
    if (!isSupabaseConfigured) {
      return { error: 'Supabase environment variables are not configured.' };
    }
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: {
          full_name: fullName.trim(),
          phone: phone.trim(),
          gender,
          church_id: churchId,
          date_of_birth: dateOfBirth,
        },
      },
    });
    if (error) {
      return { error: error.message };
    }
    const needsConfirmation = Boolean(data.user && !data.session);
    return { error: null, needsConfirmation };
  };

  const resetPassword = async (email: string) => {
    if (!isSupabaseConfigured) {
      return { error: 'Supabase environment variables are not configured.' };
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/`,
    });
    return { error: error ? error.message : null };
  };

  const signOut = async () => {
    if (isSupabaseConfigured) {
      await supabase.auth.signOut();
    }
    setProfile(null);
    setSession(null);
    setUser(null);
  };

  const role: UserRole = profile?.role ?? 'member';
  const isSuperAdmin = role === 'super_admin';
  const isDistrictAdmin = role === 'super_admin' || role === 'district_admin';
  const isAdmin = role === 'super_admin' || role === 'district_admin' || role === 'church_admin';
  const isSuspended = profile?.status === 'suspended';

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        profile,
        churches,
        loading,
        isConfigured: isSupabaseConfigured,
        isAdmin,
        isDistrictAdmin,
        isSuperAdmin,
        isSuspended,
        role,
        signIn,
        signUp,
        resetPassword,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
