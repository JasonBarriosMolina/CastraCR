import Link from 'next/link';

// ─── Pet SVG illustrations (white silhouettes, blend with gradient) ────────────

function DogSvg({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 90 110" className={className} fill="white" xmlns="http://www.w3.org/2000/svg">
      {/* Floppy ears – behind head */}
      <ellipse cx="21" cy="47" rx="13" ry="22" fillOpacity="0.72" transform="rotate(-10 21 47)" />
      <ellipse cx="69" cy="47" rx="13" ry="22" fillOpacity="0.72" transform="rotate(10 69 47)" />
      {/* Head */}
      <circle cx="45" cy="38" r="27" />
      {/* Body */}
      <ellipse cx="45" cy="89" rx="25" ry="20" />
      {/* Eyes */}
      <circle cx="36" cy="31" r="4.5" fillOpacity="0.38" />
      <circle cx="54" cy="31" r="4.5" fillOpacity="0.38" />
      {/* Nose */}
      <ellipse cx="45" cy="44" rx="7" ry="5.5" fillOpacity="0.42" />
      {/* Smile */}
      <path d="M38 52 Q45 59 52 52" stroke="white" strokeWidth="2.5" strokeOpacity="0.42" fill="none" strokeLinecap="round" />
      {/* Tail */}
      <path d="M69 77 Q89 59 82 44" stroke="white" strokeWidth="7.5" strokeLinecap="round" fill="none" />
      {/* Paws */}
      <ellipse cx="31" cy="107" rx="12" ry="7.5" fillOpacity="0.82" />
      <ellipse cx="59" cy="107" rx="12" ry="7.5" fillOpacity="0.82" />
    </svg>
  );
}

function CatSvg({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 80 104" className={className} fill="white" xmlns="http://www.w3.org/2000/svg">
      {/* Pointed ears */}
      <polygon points="13,28 5,4 28,20" fillOpacity="0.78" />
      <polygon points="67,28 75,4 52,20" fillOpacity="0.78" />
      {/* Head */}
      <circle cx="40" cy="34" r="25" />
      {/* Body */}
      <ellipse cx="40" cy="79" rx="21" ry="19" />
      {/* Eyes */}
      <ellipse cx="31" cy="29" rx="4.5" ry="5.5" fillOpacity="0.32" />
      <ellipse cx="49" cy="29" rx="4.5" ry="5.5" fillOpacity="0.32" />
      {/* Nose */}
      <polygon points="40,40 37,44 43,44" fillOpacity="0.42" />
      {/* Whiskers */}
      <line x1="13" y1="42" x2="33" y2="43" stroke="white" strokeOpacity="0.28" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="13" y1="47" x2="33" y2="47" stroke="white" strokeOpacity="0.28" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="47" y1="43" x2="67" y2="42" stroke="white" strokeOpacity="0.28" strokeWidth="1.5" strokeLinecap="round" />
      <line x1="47" y1="47" x2="67" y2="47" stroke="white" strokeOpacity="0.28" strokeWidth="1.5" strokeLinecap="round" />
      {/* Tail curled around */}
      <path d="M60 89 Q77 74 71 60 Q65 46 73 38" stroke="white" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* Paws */}
      <ellipse cx="28" cy="97" rx="10" ry="6.5" fillOpacity="0.82" />
      <ellipse cx="52" cy="97" rx="10" ry="6.5" fillOpacity="0.82" />
    </svg>
  );
}

// ─── Paw print SVG decoration ─────────────────────────────────────────────────

function PawSvg({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 40 40" className={className} style={style} fill="currentColor" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="20" cy="26" rx="9" ry="10" />
      <circle cx="9"  cy="14" r="4.5" />
      <circle cx="31" cy="14" r="4.5" />
      <circle cx="14" cy="9"  r="3.5" />
      <circle cx="26" cy="9"  r="3.5" />
    </svg>
  );
}

// ─── Page data ────────────────────────────────────────────────────────────────

const STEPS = [
  {
    icon: '🔍',
    color: 'from-cyan-400 to-brand-500',
    title: 'Encuentra una campaña',
    desc: 'Busca campañas activas cerca de tu ubicación en segundos.',
  },
  {
    icon: '🐾',
    color: 'from-teal-400 to-cyan-500',
    title: 'Registra a tu mascota',
    desc: 'Elige la sede, el turno y confirma en un par de toques.',
  },
  {
    icon: '📱',
    color: 'from-sky-400 to-brand-500',
    title: 'Presenta tu QR',
    desc: 'El día del evento muestra tu código QR para el check-in.',
  },
];

const STATS = [
  { value: '2,400+', label: 'Mascotas esterilizadas' },
  { value: '18',     label: 'Campañas activas' },
  { value: '40+',    label: 'Veterinarios aliados' },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function HomePage() {
  return (
    <div className="space-y-0">
      {/* ─── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-to-br from-brand-600 via-brand-500 to-cyan-400 px-4 pt-10 pb-20 md:pt-16 md:pb-28">
        {/* Decorative circles */}
        <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-white/10" />
        <div className="absolute -bottom-32 -left-16 w-64 h-64 rounded-full bg-white/10" />
        <div className="absolute top-1/2 right-8 w-12 h-12 rounded-full bg-white/20" />

        {/* Scattered paw prints */}
        <PawSvg className="absolute top-6    left-[58%]   w-7 h-7 rotate-12"   style={{ color: 'rgba(255,255,255,0.20)' }} />
        <PawSvg className="absolute top-14   right-[38%]  w-5 h-5 -rotate-20"  style={{ color: 'rgba(255,255,255,0.14)' }} />
        <PawSvg className="absolute top-28   left-[72%]   w-4 h-4 rotate-45"   style={{ color: 'rgba(255,255,255,0.12)' }} />
        <PawSvg className="absolute top-1/3  left-[55%]   w-6 h-6 -rotate-10"  style={{ color: 'rgba(255,255,255,0.16)' }} />
        <PawSvg className="absolute top-1/2  left-[65%]   w-5 h-5 rotate-30"   style={{ color: 'rgba(255,255,255,0.12)' }} />
        <PawSvg className="absolute bottom-24 left-[52%]  w-8 h-8 -rotate-15"  style={{ color: 'rgba(255,255,255,0.18)' }} />
        <PawSvg className="absolute bottom-14 left-[68%]  w-5 h-5 rotate-25"   style={{ color: 'rgba(255,255,255,0.13)' }} />
        <PawSvg className="absolute bottom-8  left-[42%]  w-4 h-4 rotate-5"    style={{ color: 'rgba(255,255,255,0.10)' }} />

        {/* Pet illustrations — bottom-right, semi-transparent */}
        <div
          className="absolute bottom-0 right-0 flex items-end pointer-events-none select-none"
          style={{ opacity: 0.18 }}
        >
          <CatSvg className="w-20 h-24 sm:w-24 sm:h-28 md:w-32 md:h-40" />
          <DogSvg className="w-24 h-28 sm:w-28 sm:h-32 md:w-40 md:h-48" />
        </div>

        <div className="relative max-w-2xl mx-auto text-white">
          {/* Eyebrow */}
          <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm rounded-full px-3 py-1 mb-5 text-xs font-semibold tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-green-300 animate-pulse" />
            🐕 🐈 Costa Rica · Servicio gratuito
          </div>

          <h1 className="text-3xl md:text-5xl font-extrabold leading-tight mb-4">
            Esterilización accesible<br />
            <span className="text-cyan-200">para cada mascota</span>
          </h1>
          <p className="text-white/80 text-base md:text-lg max-w-xl mb-8">
            Conectamos dueños de mascotas con campañas de esterilización gratuitas o a bajo costo en Costa Rica.
          </p>

          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              href="/campanas"
              className="bg-white text-brand-600 font-bold px-7 py-3.5 rounded-2xl hover:shadow-lg hover:shadow-brand-800/30 transition-all duration-150 text-center"
            >
              Buscar campañas
            </Link>
            <Link
              href="/auth/login"
              className="bg-white/20 backdrop-blur-sm text-white border border-white/30 font-semibold px-7 py-3.5 rounded-2xl hover:bg-white/30 transition-all duration-150 text-center"
            >
              Crear cuenta gratis
            </Link>
          </div>
        </div>
      </section>

      {/* Wave divider */}
      <div className="bg-gradient-to-br from-brand-600 via-brand-500 to-cyan-400">
        <svg viewBox="0 0 1440 48" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full block">
          <path d="M0 48L60 42.7C120 37.3 240 26.7 360 21.3C480 16 600 16 720 21.3C840 26.7 960 37.3 1080 40C1200 42.7 1320 37.3 1380 34.7L1440 32V0H1380C1320 0 1200 0 1080 0C960 0 840 0 720 0C600 0 480 0 360 0C240 0 120 0 60 0H0V48Z" fill="rgb(248,250,252)" />
        </svg>
      </div>

      {/* ─── Stats ─────────────────────────────────────────────── */}
      <section className="px-4 -mt-2 max-w-2xl mx-auto md:max-w-5xl">
        <div className="grid grid-cols-3 gap-3">
          {STATS.map((s) => (
            <div key={s.label} className="bg-white rounded-2xl p-4 text-center shadow-sm border border-slate-100">
              <p className="text-xl md:text-2xl font-extrabold text-brand-600">{s.value}</p>
              <p className="text-xs text-slate-500 mt-0.5 leading-tight">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Pets strip ────────────────────────────────────────── */}
      <section className="px-4 pt-8 max-w-2xl mx-auto md:max-w-5xl">
        <div className="bg-gradient-to-r from-cyan-50 via-brand-50 to-cyan-50 rounded-3xl border border-brand-100/60 px-5 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-3xl md:text-4xl flex-shrink-0">🐕</span>
            <div className="min-w-0">
              <p className="font-bold text-slate-800 text-sm">Perros y gatos bienvenidos</p>
              <p className="text-slate-500 text-xs mt-0.5 leading-snug">Campañas disponibles para todas las razas y tamaños</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <PawSvg className="w-5 h-5 text-brand-300" />
            <PawSvg className="w-4 h-4 text-brand-200" />
          </div>
          <span className="text-3xl md:text-4xl flex-shrink-0">🐈</span>
        </div>
      </section>

      {/* ─── How it works ──────────────────────────────────────── */}
      <section className="px-4 pt-6 pb-4 max-w-2xl mx-auto md:max-w-5xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold text-slate-800">¿Cómo funciona?</h2>
          <Link href="/campanas" className="text-sm text-brand-500 font-semibold">
            Ver campañas →
          </Link>
        </div>
        <div className="grid md:grid-cols-3 gap-4">
          {STEPS.map((step, idx) => (
            <div key={step.title} className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 flex gap-4 md:flex-col md:gap-3 animate-fade-up" style={{ animationDelay: `${idx * 80}ms` }}>
              <div className={`flex-shrink-0 w-12 h-12 rounded-2xl bg-gradient-to-br ${step.color} flex items-center justify-center text-2xl shadow-sm`}>
                {step.icon}
              </div>
              <div>
                <p className="font-bold text-slate-800 text-sm mb-1">{idx + 1}. {step.title}</p>
                <p className="text-slate-500 text-xs leading-relaxed">{step.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── CTA Donate ────────────────────────────────────────── */}
      <section className="px-4 py-6 max-w-2xl mx-auto md:max-w-5xl">
        <div className="relative overflow-hidden bg-gradient-to-r from-brand-500 to-cyan-500 rounded-3xl p-6 md:p-8 text-white">
          {/* Decorative circles */}
          <div className="absolute -right-8 -top-8 w-40 h-40 rounded-full bg-white/10" />
          <div className="absolute -left-6 -bottom-6 w-28 h-28 rounded-full bg-white/10" />

          {/* Floating paw prints */}
          <PawSvg className="absolute top-4    right-28 w-7 h-7  rotate-12"  style={{ color: 'rgba(255,255,255,0.15)' }} />
          <PawSvg className="absolute bottom-5 right-12 w-5 h-5  -rotate-6"  style={{ color: 'rgba(255,255,255,0.12)' }} />
          <PawSvg className="absolute top-1/2  right-20 w-4 h-4  rotate-45"  style={{ color: 'rgba(255,255,255,0.10)' }} />

          <div className="relative">
            <p className="text-xs font-semibold bg-white/20 rounded-full px-3 py-1 inline-block mb-3">
              50% va a organizaciones rescatistas
            </p>
            <h2 className="text-xl md:text-2xl font-bold mb-2">Apoya la causa 💙</h2>
            <p className="text-white/80 text-sm mb-5 max-w-sm">
              Cada donación ayuda a más mascotas a tener acceso a esterilización. Juntos hacemos la diferencia.
            </p>
            <Link
              href="/donar"
              className="inline-block bg-white text-brand-600 font-bold px-6 py-3 rounded-2xl hover:shadow-lg transition-all duration-150 text-sm"
            >
              Donar ahora ❤️
            </Link>
          </div>
        </div>
      </section>

      {/* ─── WhatsApp CTA ──────────────────────────────────────── */}
      <section className="px-4 pb-4 max-w-2xl mx-auto md:max-w-5xl">
        <div className="bg-white rounded-3xl p-5 border border-slate-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-green-500 flex items-center justify-center flex-shrink-0 shadow-sm">
            <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0020.464 3.488" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-slate-800 text-sm">Regístra tu mascota por WhatsApp</p>
            <p className="text-slate-500 text-xs mt-0.5">Escríbenos directamente y nuestro asistente te guía en segundos.</p>
          </div>
          <a
            href="https://wa.me/50600000000"
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 bg-green-500 text-white text-xs font-semibold px-4 py-2 rounded-xl hover:bg-green-600 transition-colors"
          >
            Chatear
          </a>
        </div>
      </section>
    </div>
  );
}
