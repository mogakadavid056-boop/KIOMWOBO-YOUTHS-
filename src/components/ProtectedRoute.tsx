import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/src/context/AuthContext';
import { GlassCard } from './GlassCard';

interface ProtectedRouteProps {
  requireAdmin?: boolean;
  requireSuperAdmin?: boolean;
  onFallback: () => void;
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({
  requireAdmin = false,
  requireSuperAdmin = false,
  onFallback,
  children,
}) => {
  const { isAdmin, isSuperAdmin } = useAuth();

  const allowed =
    (!requireAdmin || isAdmin) && (!requireSuperAdmin || isSuperAdmin);

  if (!allowed) {
    return (
      <GlassCard className="max-w-lg mx-auto mt-10 text-center py-10 px-6">
        <div className="w-14 h-14 mx-auto rounded-2xl bg-[#31005F]/60 border border-[#D4AF37]/40 flex items-center justify-center text-[#F5D88A]">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <h2 className="mt-4 font-royal-serif text-xl font-bold text-slate-900 dark:text-[#F5F1FF]">
          Admin Access Required
        </h2>
        <p className="mt-2 text-base text-slate-600 dark:text-[#C7A4FF]">
          This area is reserved for Kiomwobo District and Church administrators.
        </p>
        <button
          type="button"
          onClick={onFallback}
          className="mt-6 min-h-[44px] px-6 py-2.5 rounded-xl bg-[#8B24FF] text-white font-royal-ui text-sm font-semibold hover:bg-[#7A18EB] transition"
        >
          Return Home
        </button>
      </GlassCard>
    );
  }

  return <>{children}</>;
};
