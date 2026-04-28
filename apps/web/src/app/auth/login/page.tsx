'use client';

import { useState } from 'react';
import { signIn, signUp, confirmSignUp } from 'aws-amplify/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

type Mode = 'signin' | 'signup' | 'confirm';

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nombre, setNombre] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await signIn({ username: email, password });
      router.push('/campanas');
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
    } catch (err: unknown) {
      setError((err as Error).message ?? 'Error al confirmar');
    } finally {
      setLoading(false);
    }
  };

  const TITLE: Record<Mode, string> = {
    signin:  'Bienvenido de vuelta',
    signup:  'Crear cuenta',
    confirm: 'Verificar correo',
  };

  const SUBTITLE: Record<Mode, string> = {
    signin:  'Ingresa a tu cuenta de CastraCR',
    signup:  'Únete y ayuda a tus mascotas',
    confirm: `Código enviado a ${email}`,
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Top gradient band */}
      <div className="bg-gradient-to-br from-brand-600 via-brand-500 to-cyan-500 px-4 pt-12 pb-24 relative overflow-hidden">
        <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-white/10" />
        <div className="absolute bottom-0 -left-8 w-40 h-40 rounded-full bg-white/10" />
        <div className="max-w-sm mx-auto relative text-center">
          <Link href="/" className="inline-flex items-center gap-2 mb-6">
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
              <span className="text-2xl">🐾</span>
            </div>
            <span className="text-xl font-bold text-white">CastraCR</span>
          </Link>
          <h1 className="text-2xl font-extrabold text-white">{TITLE[mode]}</h1>
          <p className="text-white/70 text-sm mt-1">{SUBTITLE[mode]}</p>
        </div>
      </div>

      {/* Form card */}
      <div className="flex-1 px-4 -mt-12 pb-8">
        <div className="max-w-sm mx-auto bg-white rounded-3xl shadow-xl border border-slate-100 p-6 animate-fade-up">
          {error && (
            <div className="bg-red-50 border border-red-100 text-red-700 px-4 py-3 rounded-2xl text-sm mb-4">
              ⚠️ {error}
            </div>
          )}

          {/* Sign In */}
          {mode === 'signin' && (
            <form onSubmit={handleSignIn} className="space-y-4">
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
                Sin cuenta?{' '}
                <button type="button" onClick={() => { setMode('signup'); setError(''); }} className="text-brand-500 font-semibold">
                  Regístrate gratis
                </button>
              </p>
            </form>
          )}

          {/* Sign Up */}
          {mode === 'signup' && (
            <form onSubmit={handleSignUp} className="space-y-4">
              <AuthField label="Nombre completo">
                <input
                  type="text"
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  required
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
                  className="input-field"
                  placeholder="••••••••"
                />
              </AuthField>
              <AuthSubmit loading={loading}>Crear cuenta</AuthSubmit>
              <p className="text-center text-sm text-slate-500 pt-1">
                Ya tienes cuenta?{' '}
                <button type="button" onClick={() => { setMode('signin'); setError(''); }} className="text-brand-500 font-semibold">
                  Ingresa aquí
                </button>
              </p>
            </form>
          )}

          {/* Confirm */}
          {mode === 'confirm' && (
            <form onSubmit={handleConfirm} className="space-y-4">
              <div className="text-center py-2">
                <div className="w-16 h-16 bg-brand-50 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-8 h-8 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                </div>
                <p className="text-sm text-slate-600">
                  Revisá tu bandeja de entrada y escribe el código de verificación.
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
                />
              </AuthField>
              <AuthSubmit loading={loading}>Confirmar cuenta</AuthSubmit>
            </form>
          )}
        </div>
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
      className="w-full btn-primary py-4 text-sm flex items-center justify-center gap-2 mt-2"
    >
      {loading ? (
        <>
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Cargando…
        </>
      ) : children}
    </button>
  );
}
