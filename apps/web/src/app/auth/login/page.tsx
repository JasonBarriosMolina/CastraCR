'use client';

import { useState, useEffect, Suspense } from 'react';
import { signIn, signUp, confirmSignUp, fetchAuthSession } from 'aws-amplify/auth';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

type Mode = 'signin' | 'signup' | 'confirm';

// useSearchParams requiere Suspense en Next.js 14
export default function LoginPage() {
  return (
    <Suspense>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get('redirect') ?? '/campanas';

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nombre, setNombre] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Si ya está autenticado, redirigir
  useEffect(() => {
    fetchAuthSession()
      .then((s) => { if (s.tokens?.idToken) router.replace(redirectTo); })
      .catch(() => { /* no session — stay on login */ });
  }, [router, redirectTo]);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await signIn({ username: email, password });
      router.push(redirectTo);
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await signUp({ username: email, password, options: { userAttributes: { email, name: nombre } } });
      setMode('confirm');
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Error al registrarse');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await confirmSignUp({ username: email, confirmationCode: code });
      setMode('signin');
      setError('');
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Error al confirmar');
    } finally {
      setLoading(false);
    }
  };

  return (
    // Escapar el padding del layout main en desktop con márgenes negativos
    <div className="md:-mx-4 md:-mt-6 min-h-[calc(100vh-4rem)] flex flex-col">
      {/* Hero gradient — full bleed */}
      <div className="bg-gradient-to-br from-brand-700 via-brand-600 to-cyan-500 px-6 pt-10 pb-20 relative overflow-hidden flex-shrink-0">
        {/* Círculos decorativos */}
        <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-white/10" />
        <div className="absolute bottom-0 -left-12 w-52 h-52 rounded-full bg-white/10" />
        <div className="absolute top-8 left-1/2 -translate-x-1/2 w-32 h-32 rounded-full bg-white/5" />

        <div className="max-w-md mx-auto relative text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2.5 mb-8 group focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 rounded-xl"
            aria-label="Volver al inicio de CastraCR"
          >
            <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center group-hover:bg-white/30 transition-colors shadow-sm">
              <span className="text-2xl" aria-hidden>🐾</span>
            </div>
            <span className="text-xl font-bold text-white tracking-tight">CastraCR</span>
          </Link>

          {mode === 'signin' && (
            <>
              <h1 className="text-3xl font-extrabold text-white mb-2">Bienvenido de vuelta</h1>
              <p className="text-white/70 text-sm">Ingresá a tu cuenta de CastraCR</p>
            </>
          )}
          {mode === 'signup' && (
            <>
              <h1 className="text-3xl font-extrabold text-white mb-2">Crear cuenta</h1>
              <p className="text-white/70 text-sm">Únete y ayuda a tus mascotas</p>
            </>
          )}
          {mode === 'confirm' && (
            <>
              <h1 className="text-3xl font-extrabold text-white mb-2">Verificar correo</h1>
              <p className="text-white/70 text-sm">Código enviado a <strong className="text-white">{email}</strong></p>
            </>
          )}
        </div>
      </div>

      {/* Form card — overlapping the hero */}
      <div className="flex-1 px-4 -mt-10 pb-10">
        <div className="max-w-md mx-auto bg-white rounded-3xl shadow-2xl border border-slate-100/80 overflow-hidden">
          {/* Color strip */}
          <div className="h-1 bg-gradient-to-r from-brand-400 via-cyan-400 to-brand-500" />

          <div className="p-7">
            {error && (
              <div
                role="alert"
                className="bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-2xl text-sm mb-5 flex items-start gap-2"
              >
                <span aria-hidden className="mt-0.5 flex-shrink-0">⚠️</span>
                <span>{error}</span>
              </div>
            )}

            {/* Sign In */}
            {mode === 'signin' && (
              <form onSubmit={handleSignIn} className="space-y-5">
                <AuthField label="Correo electrónico">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="input-field"
                    placeholder="correo@ejemplo.com"
                  />
                </AuthField>
                <AuthField label="Contraseña">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="current-password"
                    className="input-field"
                    placeholder="••••••••"
                  />
                </AuthField>
                <AuthSubmit loading={loading}>Ingresar</AuthSubmit>
                <p className="text-center text-sm text-slate-500 pt-1">
                  ¿Sin cuenta?{' '}
                  <button
                    type="button"
                    onClick={() => { setMode('signup'); setError(''); }}
                    className="text-brand-600 font-semibold hover:text-brand-700 transition-colors focus:outline-none focus-visible:underline"
                  >
                    Registrate gratis
                  </button>
                </p>
              </form>
            )}

            {/* Sign Up */}
            {mode === 'signup' && (
              <form onSubmit={handleSignUp} className="space-y-5">
                <AuthField label="Nombre completo">
                  <input
                    type="text"
                    value={nombre}
                    onChange={(e) => setNombre(e.target.value)}
                    required
                    autoComplete="name"
                    className="input-field"
                    placeholder="Tu nombre"
                  />
                </AuthField>
                <AuthField label="Correo electrónico">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="email"
                    className="input-field"
                    placeholder="correo@ejemplo.com"
                  />
                </AuthField>
                <AuthField label="Contraseña (mín. 8 caracteres)">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="new-password"
                    minLength={8}
                    className="input-field"
                    placeholder="••••••••"
                  />
                </AuthField>
                <AuthSubmit loading={loading}>Crear cuenta</AuthSubmit>
                <p className="text-center text-sm text-slate-500 pt-1">
                  ¿Ya tenés cuenta?{' '}
                  <button
                    type="button"
                    onClick={() => { setMode('signin'); setError(''); }}
                    className="text-brand-600 font-semibold hover:text-brand-700 transition-colors focus:outline-none focus-visible:underline"
                  >
                    Ingresá aquí
                  </button>
                </p>
              </form>
            )}

            {/* Confirm */}
            {mode === 'confirm' && (
              <form onSubmit={handleConfirm} className="space-y-5">
                <div className="text-center py-2">
                  <div className="w-16 h-16 bg-brand-50 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner">
                    <svg className="w-8 h-8 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <p className="text-sm text-slate-600">
                    Revisá tu bandeja de entrada y escribí el código de verificación.
                  </p>
                </div>
                <AuthField label="Código de verificación">
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    required
                    inputMode="numeric"
                    maxLength={6}
                    className="input-field text-center text-2xl tracking-[0.5em] font-bold"
                    placeholder="______"
                    aria-label="Código de 6 dígitos"
                  />
                </AuthField>
                <AuthSubmit loading={loading}>Confirmar cuenta</AuthSubmit>
                <p className="text-center text-sm text-slate-500">
                  <button
                    type="button"
                    onClick={() => { setMode('signin'); setError(''); }}
                    className="text-brand-600 font-semibold hover:text-brand-700 transition-colors focus:outline-none focus-visible:underline"
                  >
                    ← Volver al inicio de sesión
                  </button>
                </p>
              </form>
            )}
          </div>
        </div>

        {/* Footer note */}
        <p className="text-center text-xs text-slate-400 mt-6">
          Al registrarte aceptás los{' '}
          <Link href="/terminos" className="underline hover:text-slate-600">Términos de uso</Link>
          {' '}y la{' '}
          <Link href="/privacidad" className="underline hover:text-slate-600">Política de privacidad</Link>.
        </p>
      </div>
    </div>
  );
}

function AuthField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-slate-600 uppercase tracking-wide">{label}</label>
      {children}
    </div>
  );
}

function AuthSubmit({ children, loading }: { children: React.ReactNode; loading: boolean }) {
  return (
    <button
      type="submit"
      disabled={loading}
      aria-busy={loading}
      className="w-full btn-primary py-4 text-sm flex items-center justify-center gap-2 mt-2 min-h-[52px]"
    >
      {loading ? (
        <>
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" aria-hidden>
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Cargando…
        </>
      ) : children}
    </button>
  );
}
