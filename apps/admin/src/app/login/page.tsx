'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signIn, confirmSignIn, fetchAuthSession, signOut, resetPassword, confirmResetPassword } from 'aws-amplify/auth';
import '@/lib/amplify';

type Step = 'login' | 'new-password' | 'forgot' | 'forgot-confirm' | 'forgot-done';

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
    </svg>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const unauthorizedError = searchParams.get('error') === 'unauthorized';

  const [step, setStep] = useState<Step>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [resetCode, setResetCode] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  // Redirigir si ya hay sesión válida
  useEffect(() => {
    fetchAuthSession()
      .then((session) => {
        const groups = (session.tokens?.idToken?.payload?.['cognito:groups'] as string[] | undefined) ?? [];
        if (groups.includes('SuperAdmin') || groups.includes('Organizador')) {
          router.replace('/');
        }
      })
      .catch(() => {});
  }, [router]);

  // ─── Paso 1: Login ───────────────────────────────────────────────────────────
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const result = await signIn({ username: email, password });

      if (result.nextStep?.signInStep === 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED') {
        // Primera vez — mostrar formulario de nueva contraseña
        setStep('new-password');
        setLoading(false);
        return;
      }

      if (result.isSignedIn) {
        await verifyRoleAndRedirect();
      }
    } catch (err: unknown) {
      setError(mapAuthError((err as Error).message));
      setLoading(false);
    }
  };

  // ─── Paso 2: Cambiar contraseña temporal ─────────────────────────────────────
  const handleNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword !== confirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    if (newPassword.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }

    setLoading(true);
    try {
      const result = await confirmSignIn({ challengeResponse: newPassword });

      if (result.isSignedIn) {
        await verifyRoleAndRedirect();
      }
    } catch (err: unknown) {
      setError(mapAuthError((err as Error).message));
      setLoading(false);
    }
  };

  // ─── Paso: Solicitar código de reset ─────────────────────────────────────────
  const handleForgotRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      await resetPassword({ username: forgotEmail });
      setStep('forgot-confirm');
    } catch (err: unknown) {
      setError(mapAuthError((err as Error).message));
    } finally {
      setLoading(false);
    }
  };

  // ─── Paso: Confirmar código + nueva contraseña ────────────────────────────────
  const handleForgotConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (resetNewPassword !== resetConfirmPassword) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    if (resetNewPassword.length < 8) {
      setError('La contraseña debe tener al menos 8 caracteres.');
      return;
    }
    setLoading(true);
    try {
      await confirmResetPassword({
        username: forgotEmail,
        confirmationCode: resetCode,
        newPassword: resetNewPassword,
      });
      setStep('forgot-done');
    } catch (err: unknown) {
      setError(mapAuthError((err as Error).message));
    } finally {
      setLoading(false);
    }
  };

  // ─── Verificar rol y redirigir ────────────────────────────────────────────────
  async function verifyRoleAndRedirect() {
    const session = await fetchAuthSession({ forceRefresh: true });
    const groups = (session.tokens?.idToken?.payload?.['cognito:groups'] as string[] | undefined) ?? [];
    const hasAccess = groups.includes('SuperAdmin') || groups.includes('Organizador');

    if (!hasAccess) {
      await signOut();
      setError('No tienes acceso al panel. Contacta al administrador.');
      setStep('login');
      setLoading(false);
      return;
    }

    router.replace('/');
  }

  function mapAuthError(message: string): string {
    if (message.includes('Incorrect username or password')) return 'Correo o contraseña incorrectos.';
    if (message.includes('User does not exist')) return 'No existe una cuenta con este correo.';
    if (message.includes('Password attempts exceeded')) return 'Demasiados intentos. Intenta en unos minutos.';
    if (message.includes('Password does not conform')) return 'La contraseña debe tener mayúsculas, minúsculas y números.';
    if (message.includes('Invalid session')) return 'Sesión expirada. Vuelve a iniciar sesión.';
    if (message.includes('Invalid verification code')) return 'Código incorrecto. Revisa tu correo e intenta de nuevo.';
    if (message.includes('Attempt limit exceeded')) return 'Demasiados intentos. Espera unos minutos.';
    if (message.includes('ExpiredCodeException') || message.includes('expired')) return 'El código expiró. Solicita uno nuevo.';
    return message || 'Error al iniciar sesión. Intenta de nuevo.';
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50 px-4">
      {/* Logo */}
      <div className="mb-8 text-center">
        <div className="inline-flex items-center gap-2 mb-2">
          <span className="text-3xl">🐾</span>
          <span className="text-2xl font-bold text-brand-700">CastraCR</span>
        </div>
        <p className="text-sm text-gray-500">Panel de Administración</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border p-8 space-y-6">

        {/* ── Paso 1: Login ── */}
        {step === 'login' && (
          <>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Iniciar sesión</h1>
              <p className="text-sm text-gray-500 mt-1">Acceso restringido a personal autorizado</p>
            </div>

            {unauthorizedError && !error && (
              <div className="bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-xl text-sm">
                Tu cuenta no tiene permisos para acceder al panel.
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Correo electrónico</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  autoComplete="email"
                  placeholder="admin@castrar.cr"
                  className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Contraseña</label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="w-full border rounded-xl px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  />
                  <button type="button" onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <EyeIcon open={showPassword} />
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !email || !password}
                className="w-full bg-brand-600 text-white py-2.5 rounded-xl font-medium hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading
                  ? <span className="flex items-center justify-center gap-2"><Spinner /> Verificando…</span>
                  : 'Entrar al panel'}
              </button>
            </form>

            <div className="text-center">
              <button
                type="button"
                onClick={() => { setError(''); setForgotEmail(email); setStep('forgot'); }}
                className="text-sm text-brand-600 hover:text-brand-700 font-medium"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
          </>
        )}

        {/* ── Forgot: Ingresar correo ── */}
        {step === 'forgot' && (
          <>
            <div>
              <button
                type="button"
                onClick={() => { setError(''); setStep('login'); }}
                className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-4"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
                Volver
              </button>
              <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center mb-4">
                <span className="text-xl">✉️</span>
              </div>
              <h1 className="text-xl font-bold text-gray-900">Recuperar contraseña</h1>
              <p className="text-sm text-gray-500 mt-1">
                Te enviamos un código de verificación a tu correo.
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleForgotRequest} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Correo electrónico</label>
                <input
                  type="email"
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  required
                  autoFocus
                  autoComplete="email"
                  placeholder="tu@correo.com"
                  className="w-full border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !forgotEmail}
                className="w-full bg-brand-600 text-white py-2.5 rounded-xl font-medium hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading
                  ? <span className="flex items-center justify-center gap-2"><Spinner /> Enviando…</span>
                  : 'Enviar código'}
              </button>
            </form>
          </>
        )}

        {/* ── Forgot: Código + nueva contraseña ── */}
        {step === 'forgot-confirm' && (
          <>
            <div>
              <div className="w-10 h-10 bg-green-50 rounded-xl flex items-center justify-center mb-4">
                <span className="text-xl">🔑</span>
              </div>
              <h1 className="text-xl font-bold text-gray-900">Revisa tu correo</h1>
              <p className="text-sm text-gray-500 mt-1">
                Ingresa el código que enviamos a <span className="font-medium text-gray-700">{forgotEmail}</span> y elige una nueva contraseña.
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleForgotConfirm} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Código de verificación</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value.replace(/\D/g, ''))}
                  required
                  autoFocus
                  autoComplete="one-time-code"
                  placeholder="123456"
                  maxLength={6}
                  className="w-full border rounded-xl px-4 py-2.5 text-sm text-center tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                />
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Nueva contraseña</label>
                <div className="relative">
                  <input
                    type={showResetPassword ? 'text' : 'password'}
                    value={resetNewPassword}
                    onChange={(e) => setResetNewPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    placeholder="Mínimo 8 caracteres"
                    className="w-full border rounded-xl px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  />
                  <button type="button" onClick={() => setShowResetPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <EyeIcon open={showResetPassword} />
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Confirmar contraseña</label>
                <div className="relative">
                  <input
                    type={showResetConfirm ? 'text' : 'password'}
                    value={resetConfirmPassword}
                    onChange={(e) => setResetConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    placeholder="Repite la contraseña"
                    className="w-full border rounded-xl px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  />
                  <button type="button" onClick={() => setShowResetConfirm(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <EyeIcon open={showResetConfirm} />
                  </button>
                </div>
              </div>

              {/* Requisitos */}
              <ul className="text-xs text-gray-400 space-y-1 pl-1">
                <li className={resetNewPassword.length >= 8 ? 'text-green-600' : ''}>
                  {resetNewPassword.length >= 8 ? '✓' : '·'} Al menos 8 caracteres
                </li>
                <li className={/[A-Z]/.test(resetNewPassword) ? 'text-green-600' : ''}>
                  {/[A-Z]/.test(resetNewPassword) ? '✓' : '·'} Una mayúscula
                </li>
                <li className={/[0-9]/.test(resetNewPassword) ? 'text-green-600' : ''}>
                  {/[0-9]/.test(resetNewPassword) ? '✓' : '·'} Un número
                </li>
              </ul>

              <button
                type="submit"
                disabled={loading || !resetCode || !resetNewPassword || !resetConfirmPassword}
                className="w-full bg-brand-600 text-white py-2.5 rounded-xl font-medium hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading
                  ? <span className="flex items-center justify-center gap-2"><Spinner /> Guardando…</span>
                  : 'Cambiar contraseña'}
              </button>
            </form>

            <div className="text-center">
              <button
                type="button"
                onClick={() => { setError(''); handleForgotRequest({ preventDefault: () => {} } as React.FormEvent); }}
                className="text-sm text-gray-500 hover:text-brand-600"
              >
                ¿No recibiste el código? Reenviar
              </button>
            </div>
          </>
        )}

        {/* ── Forgot: Éxito ── */}
        {step === 'forgot-done' && (
          <>
            <div className="text-center space-y-4 py-4">
              <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center mx-auto">
                <span className="text-3xl">✅</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">¡Contraseña cambiada!</h1>
                <p className="text-sm text-gray-500 mt-2">
                  Tu contraseña fue actualizada correctamente. Ya podés iniciar sesión.
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setError(''); setPassword(''); setStep('login'); }}
                className="w-full bg-brand-600 text-white py-2.5 rounded-xl font-medium hover:bg-brand-700 transition-colors"
              >
                Ir al login
              </button>
            </div>
          </>
        )}

        {/* ── Paso 2: Nueva contraseña ── */}
        {step === 'new-password' && (
          <>
            <div>
              <div className="w-10 h-10 bg-brand-100 rounded-xl flex items-center justify-center mb-4">
                <span className="text-xl">🔐</span>
              </div>
              <h1 className="text-xl font-bold text-gray-900">Crea tu contraseña</h1>
              <p className="text-sm text-gray-500 mt-1">
                Es tu primer acceso. Elige una contraseña permanente para tu cuenta.
              </p>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <form onSubmit={handleNewPassword} className="space-y-4">
              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Nueva contraseña</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    autoFocus
                    autoComplete="new-password"
                    placeholder="Mínimo 8 caracteres"
                    className="w-full border rounded-xl px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  />
                  <button type="button" onClick={() => setShowNewPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <EyeIcon open={showNewPassword} />
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="block text-sm font-medium text-gray-700">Confirmar contraseña</label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    placeholder="Repite la contraseña"
                    className="w-full border rounded-xl px-4 py-2.5 pr-10 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-transparent"
                  />
                  <button type="button" onClick={() => setShowConfirmPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                    <EyeIcon open={showConfirmPassword} />
                  </button>
                </div>
              </div>

              {/* Requisitos */}
              <ul className="text-xs text-gray-400 space-y-1 pl-1">
                <li className={newPassword.length >= 8 ? 'text-green-600' : ''}>
                  {newPassword.length >= 8 ? '✓' : '·'} Al menos 8 caracteres
                </li>
                <li className={/[A-Z]/.test(newPassword) ? 'text-green-600' : ''}>
                  {/[A-Z]/.test(newPassword) ? '✓' : '·'} Una mayúscula
                </li>
                <li className={/[0-9]/.test(newPassword) ? 'text-green-600' : ''}>
                  {/[0-9]/.test(newPassword) ? '✓' : '·'} Un número
                </li>
              </ul>

              <button
                type="submit"
                disabled={loading || !newPassword || !confirmPassword}
                className="w-full bg-brand-600 text-white py-2.5 rounded-xl font-medium hover:bg-brand-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading
                  ? <span className="flex items-center justify-center gap-2"><Spinner /> Guardando…</span>
                  : 'Guardar contraseña y entrar'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
