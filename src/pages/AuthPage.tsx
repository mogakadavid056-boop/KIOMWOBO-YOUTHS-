import React, { useState } from 'react';
import { Calendar, Eye, EyeOff, KeyRound, Mail, Phone, User, Church as ChurchIcon } from 'lucide-react';
import { useAuth } from '@/src/context/AuthContext';
import { useLanguage } from '@/src/context/LanguageContext';
import { useToast } from '@/src/context/ToastContext';
import { calculateAgeFromDob } from '@/src/lib/mediaUtils';
import { GlassCard } from '@/src/components/GlassCard';
import { PWAInstallButton } from '@/src/components/PWAInstallButton';

type AuthMode = 'login' | 'register' | 'forgot';

export const AuthPage: React.FC = () => {
  const { churches, signIn, signUp, resetPassword, isConfigured } = useAuth();
  const { t } = useLanguage();
  const { showToast } = useToast();

  const [mode, setMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Registration fields
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState('Male');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [churchId, setChurchId] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [infoMsg, setInfoMsg] = useState<string | null>(null);

  const selectedChurchId = churchId || churches[0]?.id || '';

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    if (!email.trim() || !password) {
      setErrorMsg('Please enter both your email address and password.');
      return;
    }

    setSubmitting(true);
    const { error } = await signIn(email, password);
    setSubmitting(false);

    if (error) {
      setErrorMsg(error);
    } else {
      showToast('Signed in successfully.', 'success');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    if (!fullName.trim() || !phone.trim() || !dateOfBirth || !selectedChurchId || !email.trim() || password.length < 6) {
      setErrorMsg('Please fill in all fields including Date of Birth. Password must be at least 6 characters.');
      return;
    }

    const age = calculateAgeFromDob(dateOfBirth);
    if (age === null || age < 16) {
      setErrorMsg('KIOMWOBO YOUTHS is for members aged 16 and above.');
      return;
    }

    setSubmitting(true);
    const { error, needsConfirmation } = await signUp({
      email,
      password,
      fullName,
      phone,
      gender,
      churchId: selectedChurchId,
      dateOfBirth,
    });
    setSubmitting(false);

    if (error) {
      setErrorMsg(error);
      return;
    }

    if (needsConfirmation) {
      setInfoMsg('Account created! Please check your email inbox to confirm your address before signing in.');
      setMode('login');
    } else {
      showToast('Welcome to Kiomwobo Youths!', 'success');
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setInfoMsg(null);

    if (!email.trim()) {
      setErrorMsg('Please enter your email address.');
      return;
    }

    setSubmitting(true);
    const { error } = await resetPassword(email);
    setSubmitting(false);

    if (error) {
      setErrorMsg(error);
    } else {
      setInfoMsg('Password reset instructions have been sent to your email.');
    }
  };

  return (
    <div className="min-h-dvh w-full bg-canvas-login relative flex flex-col justify-end items-center px-4 pt-48 pb-6 sm:pb-10">
      {/* Subtle bottom gradient solely to preserve lower-half card contrast without hiding upper artwork */}
      <div className="absolute inset-x-0 bottom-0 h-[62%] bg-gradient-to-t from-[#080610]/85 via-[#080610]/45 to-transparent pointer-events-none" />

      <div className="relative z-10 w-full max-w-md space-y-3">
        {!isConfigured && (
          <GlassCard padding="sm" className="border-amber-400/50 text-amber-200 text-xs leading-relaxed">
            Configure <code className="font-mono text-[#F5D88A]">VITE_SUPABASE_URL</code> and{' '}
            <code className="font-mono text-[#F5D88A]">VITE_SUPABASE_ANON_KEY</code> in your environment
            secrets to enable live authentication.
          </GlassCard>
        )}

        {/* Glass card anchored in the lower half of the screen; NO duplicate "Welcome Back / Login to continue" text */}
        <GlassCard elevated padding="lg" className="w-full">
          {/* Segmented Mode Switch */}
          {mode !== 'forgot' && (
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#080610]/60 border border-[#D4AF37]/25 mb-5">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setErrorMsg(null);
                }}
                className={`min-h-[44px] rounded-lg font-royal-ui text-sm font-semibold transition-all whitespace-nowrap ${
                  mode === 'login'
                    ? 'bg-[#31005F] text-[#F5D88A] border border-[#D4AF37]/45 violet-glow'
                    : 'text-[#C7A4FF]/80 hover:text-[#F5F1FF]'
                }`}
              >
                {t.auth.signIn}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setErrorMsg(null);
                }}
                className={`min-h-[44px] rounded-lg font-royal-ui text-sm font-semibold transition-all whitespace-nowrap ${
                  mode === 'register'
                    ? 'bg-[#31005F] text-[#F5D88A] border border-[#D4AF37]/45 violet-glow'
                    : 'text-[#C7A4FF]/80 hover:text-[#F5F1FF]'
                }`}
              >
                {t.auth.register}
              </button>
            </div>
          )}

          {errorMsg && (
            <div className="mb-4 rounded-xl border border-red-400/50 bg-red-950/50 px-3.5 py-2.5 text-sm text-red-200">
              {errorMsg}
            </div>
          )}

          {infoMsg && (
            <div className="mb-4 rounded-xl border border-[#D4AF37]/50 bg-[#31005F]/50 px-3.5 py-2.5 text-sm text-[#F5D88A]">
              {infoMsg}
            </div>
          )}

          {mode === 'login' && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#C7A4FF] mb-1.5">
                  {t.auth.email}
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-[#D4AF37] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="youth@kiomwobo.org"
                    className="w-full min-h-[46px] pl-10 pr-4 rounded-xl bg-[#080610]/70 border border-[#D4AF37]/30 text-base text-[#F5F1FF] placeholder:text-[#C7A4FF]/40 focus:outline-none focus:border-[#8B24FF] focus:ring-1 focus:ring-[#8B24FF]"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium text-[#C7A4FF]">{t.auth.password}</label>
                  <button
                    type="button"
                    onClick={() => {
                      setMode('forgot');
                      setErrorMsg(null);
                      setInfoMsg(null);
                    }}
                    className="text-xs font-medium text-[#F5D88A] hover:underline py-1"
                  >
                    {t.auth.forgotPassword}
                  </button>
                </div>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-[#D4AF37] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    autoComplete="current-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full min-h-[46px] pl-10 pr-12 rounded-xl bg-[#080610]/70 border border-[#D4AF37]/30 text-base text-[#F5F1FF] placeholder:text-[#C7A4FF]/40 focus:outline-none focus:border-[#8B24FF] focus:ring-1 focus:ring-[#8B24FF]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 min-w-[40px] min-h-[40px] flex items-center justify-center text-[#C7A4FF] hover:text-[#F5D88A]"
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[48px] rounded-xl bg-gradient-to-r from-[#8B24FF] to-[#5B14B8] hover:brightness-110 active:scale-[0.99] disabled:opacity-60 text-white font-royal-ui text-sm font-semibold tracking-wide border border-[#D4AF37]/45 shadow-lg transition-all"
              >
                {submitting ? t.auth.submitting : t.auth.signIn}
              </button>
            </form>
          )}

          {mode === 'register' && (
            <form onSubmit={handleRegister} className="space-y-3.5 max-h-[52dvh] overflow-y-auto pr-1">
              <div>
                <label className="block text-sm font-medium text-[#C7A4FF] mb-1">
                  {t.auth.fullName}
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-[#D4AF37] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Grace Moraa"
                    className="w-full min-h-[44px] pl-10 pr-3 rounded-xl bg-[#080610]/70 border border-[#D4AF37]/30 text-base text-[#F5F1FF] placeholder:text-[#C7A4FF]/40 focus:outline-none focus:border-[#8B24FF]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[#C7A4FF] mb-1">
                    {t.auth.phone}
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-[#D4AF37] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+254 712 345 678"
                      className="w-full min-h-[44px] pl-10 pr-3 rounded-xl bg-[#080610]/70 border border-[#D4AF37]/30 text-base text-[#F5F1FF] placeholder:text-[#C7A4FF]/40 focus:outline-none focus:border-[#8B24FF]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#C7A4FF] mb-1">
                    {t.auth.gender}
                  </label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="w-full min-h-[44px] px-3 rounded-xl bg-[#080610]/85 border border-[#D4AF37]/30 text-base text-[#F5F1FF] focus:outline-none focus:border-[#8B24FF]"
                  >
                    <option value="Male">{t.auth.male}</option>
                    <option value="Female">{t.auth.female}</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-[#C7A4FF] mb-1">
                    Date of Birth (16+)
                  </label>
                  <div className="relative">
                    <Calendar className="w-4 h-4 text-[#D4AF37] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      type="date"
                      required
                      max={new Date().toISOString().split('T')[0]}
                      value={dateOfBirth}
                      onChange={(e) => setDateOfBirth(e.target.value)}
                      className="w-full min-h-[44px] pl-10 pr-3 rounded-xl bg-[#080610]/70 border border-[#D4AF37]/30 text-base text-[#F5F1FF] focus:outline-none focus:border-[#8B24FF]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-[#C7A4FF] mb-1">
                    {t.auth.church}
                  </label>
                  <div className="relative">
                    <ChurchIcon className="w-4 h-4 text-[#D4AF37] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <select
                      required
                      value={selectedChurchId}
                      onChange={(e) => setChurchId(e.target.value)}
                      className="w-full min-h-[44px] pl-10 pr-3 rounded-xl bg-[#080610]/85 border border-[#D4AF37]/30 text-base text-[#F5F1FF] focus:outline-none focus:border-[#8B24FF]"
                    >
                      {churches.map((church) => (
                        <option key={church.id} value={church.id}>
                          {church.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-[#C7A4FF] mb-1">
                  {t.auth.email}
                </label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="youth@kiomwobo.org"
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#080610]/70 border border-[#D4AF37]/30 text-base text-[#F5F1FF] placeholder:text-[#C7A4FF]/40 focus:outline-none focus:border-[#8B24FF]"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-[#C7A4FF] mb-1">
                  {t.auth.password}
                </label>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 6 characters"
                  className="w-full min-h-[44px] px-3.5 rounded-xl bg-[#080610]/70 border border-[#D4AF37]/30 text-base text-[#F5F1FF] placeholder:text-[#C7A4FF]/40 focus:outline-none focus:border-[#8B24FF]"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[48px] rounded-xl bg-gradient-to-r from-[#D4AF37] to-[#F5D88A] hover:brightness-105 active:scale-[0.99] disabled:opacity-60 text-[#080610] font-royal-ui text-sm font-bold tracking-wide shadow-lg transition-all"
              >
                {submitting ? t.auth.submitting : t.auth.register}
              </button>
            </form>
          )}

          {mode === 'forgot' && (
            <form onSubmit={handleForgot} className="space-y-4">
              <p className="text-sm text-[#C7A4FF] leading-relaxed">
                {t.auth.resetInstructions}
              </p>
              <div>
                <label className="block text-sm font-medium text-[#C7A4FF] mb-1.5">
                  {t.auth.email}
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="youth@kiomwobo.org"
                  className="w-full min-h-[46px] px-3.5 rounded-xl bg-[#080610]/70 border border-[#D4AF37]/30 text-base text-[#F5F1FF] focus:outline-none focus:border-[#8B24FF]"
                />
              </div>
              <button
                type="submit"
                disabled={submitting}
                className="w-full min-h-[48px] rounded-xl bg-[#8B24FF] hover:bg-[#7A18EB] text-white font-royal-ui text-sm font-semibold transition"
              >
                {submitting ? t.auth.submitting : t.auth.sendReset}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setErrorMsg(null);
                  setInfoMsg(null);
                }}
                className="w-full min-h-[44px] text-sm font-medium text-[#F5D88A] hover:underline"
              >
                {t.auth.backToLogin}
              </button>
            </form>
          )}

          <div className="mt-4 flex justify-center">
            <PWAInstallButton compact />
          </div>
        </GlassCard>
      </div>
    </div>
  );
};
