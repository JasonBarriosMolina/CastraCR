'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getPet, submitScreeningAudio } from '@/lib/api';
import type { ScreeningResult } from '@/lib/api';
import type { PetProfile } from '@castrar-cr/types';

// ── Wizard steps ───────────────────────────────────────────────────────────────

type WizardStep =
  | 'salud'
  | 'peso'
  | 'vacunas'
  | 'reproductivo'   // solo hembras
  | 'criptorquidismo' // solo machos
  | 'tratamientos'
  | 'resumen';

interface WizardData {
  condicionSaludRaw?: string;
  saludOk?: boolean;
  pesoKg?: number;
  vacunasAlDia?: boolean;
  estadoReproductivo?: 'normal' | 'celo' | 'prenada' | 'lactando';
  criptorquidismo?: boolean;
  tratamientosActivos?: string;
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function PetHeader({ pet }: { pet: PetProfile }) {
  const emoji = pet.especie === 'perro' ? '🐕' : pet.especie === 'gato' ? '🐈' : '🐾';
  return (
    <div className="flex items-center gap-3 mb-6">
      <div className="w-14 h-14 bg-brand-50 rounded-2xl flex items-center justify-center text-3xl" aria-hidden="true">
        {emoji}
      </div>
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{pet.nombre}</h1>
        <p className="text-gray-500 text-sm capitalize">{pet.especie} · {pet.sexo}</p>
      </div>
    </div>
  );
}

// ── MODO AUDIO ────────────────────────────────────────────────────────────────

type RecordingState = 'idle' | 'recording' | 'recorded' | 'processing' | 'done' | 'error';

function AudioMode({
  pet,
  onResult,
  onSwitchToWizard,
}: {
  pet: PetProfile;
  onResult: (r: ScreeningResult) => void;
  onSwitchToWizard: () => void;
}) {
  const [state, setState] = useState<RecordingState>('idle');
  const [seconds, setSeconds] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState('');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const MAX_SECONDS = 60;

  const stopTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    stopTimer();
  }, [stopTimer]);

  // Auto-stop al llegar a 60s
  useEffect(() => {
    if (seconds >= MAX_SECONDS && state === 'recording') {
      stopRecording();
    }
  }, [seconds, state, stopRecording]);

  // Cleanup
  useEffect(() => {
    return () => {
      stopTimer();
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [stopTimer, audioUrl]);

  const startRecording = async () => {
    setError('');
    setSeconds(0);
    chunksRef.current = [];

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      // Elegir formato compatible
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')
          ? 'audio/ogg;codecs=opus'
          : 'audio/mp4';

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        setState('recorded');
      };

      recorder.start(100); // collect every 100ms
      setState('recording');

      timerRef.current = setInterval(() => setSeconds(s => s + 1), 1000);
    } catch {
      setError('No pudimos acceder al micrófono. Verificá los permisos del navegador.');
    }
  };

  const handleSubmit = async () => {
    if (!audioBlob) return;
    setState('processing');
    setError('');

    try {
      const result = await submitScreeningAudio(pet.petId, audioBlob, {
        nombre: pet.nombre,
        especie: pet.especie,
        sexo: pet.sexo,
      });
      setState('done');
      onResult(result.extracted);
    } catch (err: unknown) {
      setError((err as Error).message);
      setState('error');
    }
  };

  const reset = () => {
    setAudioBlob(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setSeconds(0);
    setState('idle');
    setError('');
  };

  const progress = Math.min((seconds / MAX_SECONDS) * 100, 100);
  const isRecording = state === 'recording';
  const isRecorded = state === 'recorded';
  const isProcessing = state === 'processing';

  return (
    <div className="space-y-6">
      {/* Instrucciones */}
      <div className="bg-brand-50 rounded-2xl px-5 py-4 space-y-2">
        <p className="font-semibold text-brand-800 text-base">🎤 Contanos sobre {pet.nombre}</p>
        <p className="text-brand-700 text-sm leading-relaxed">
          Grabá un audio corto (hasta 60 segundos) respondiendo estas preguntas:
        </p>
        <ul className="text-brand-700 text-sm space-y-1 ml-2">
          <li>• ¿{pet.nombre} está sano/a o tiene algún problema de salud?</li>
          <li>• ¿Cuánto pesa aproximadamente?</li>
          <li>• ¿Tiene las vacunas al día?</li>
          <li>• ¿Está tomando algún medicamento?</li>
          {pet.sexo === 'hembra' && <li>• ¿Está embarazada, en celo o amamantando?</li>}
          {pet.sexo === 'macho' && <li>• ¿Tiene los dos testículos normales?</li>}
        </ul>
      </div>

      {/* Botón de grabación */}
      <div className="flex flex-col items-center gap-4">

        {/* Círculo de grabación */}
        <div className="relative">
          {/* Anillo de progreso */}
          <svg width="160" height="160" className="rotate-[-90deg]" aria-hidden="true">
            <circle cx="80" cy="80" r="70" fill="none" stroke="#e5e7eb" strokeWidth="8" />
            <circle
              cx="80" cy="80" r="70"
              fill="none"
              stroke={isRecording ? '#ef4444' : '#06b6d4'}
              strokeWidth="8"
              strokeDasharray={`${2 * Math.PI * 70}`}
              strokeDashoffset={`${2 * Math.PI * 70 * (1 - progress / 100)}`}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.5s ease' }}
            />
          </svg>

          {/* Botón central */}
          <button
            onClick={isRecording ? stopRecording : isRecorded ? reset : startRecording}
            disabled={isProcessing}
            aria-label={isRecording ? 'Detener grabación' : isRecorded ? 'Grabar de nuevo' : 'Iniciar grabación'}
            className={`absolute inset-0 m-4 rounded-full flex flex-col items-center justify-center transition-all focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-400
              ${isRecording
                ? 'bg-red-500 hover:bg-red-600 animate-pulse'
                : isRecorded
                  ? 'bg-gray-100 hover:bg-gray-200'
                  : 'bg-brand-600 hover:bg-brand-700'
              }
            `}
          >
            <span className="text-4xl" aria-hidden="true">
              {isRecording ? '⏹️' : isRecorded ? '🔄' : '🎤'}
            </span>
            <span className={`text-xs font-bold mt-1 ${isRecording || isRecorded ? 'text-gray-700' : 'text-white'}`}>
              {isRecording
                ? `${seconds}s / ${MAX_SECONDS}s`
                : isRecorded
                  ? 'Grabar de nuevo'
                  : 'Grabar'}
            </span>
          </button>
        </div>

        {/* Estado */}
        <p className="text-sm text-gray-500 text-center" role="status" aria-live="polite">
          {isRecording && '🔴 Grabando… Hablá con calma'}
          {isRecorded && '✅ Audio grabado — reproducilo o envialo'}
          {isProcessing && '⏳ Claude está analizando tu audio…'}
          {state === 'idle' && 'Tocá el micrófono para empezar'}
          {state === 'error' && ''}
        </p>

        {/* Reproductor */}
        {audioUrl && isRecorded && (
          <audio
            src={audioUrl}
            controls
            className="w-full max-w-xs rounded-xl"
            aria-label="Audio grabado — reproducilo para verificar"
          />
        )}

        {/* Error */}
        {error && (
          <div role="alert" className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm w-full text-center">
            ❌ {error}
          </div>
        )}

        {/* Botón enviar */}
        {isRecorded && (
          <button
            onClick={() => void handleSubmit()}
            className="w-full bg-brand-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-brand-700 transition-colors min-h-[56px] focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-400"
            aria-label="Enviar audio para análisis"
          >
            📤 Enviar audio
          </button>
        )}
      </div>

      {/* Opción wizard */}
      <div className="text-center">
        <button
          onClick={onSwitchToWizard}
          className="text-brand-600 text-sm font-semibold underline underline-offset-2 hover:text-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 rounded"
        >
          Prefiero responder las preguntas una por una →
        </button>
      </div>
    </div>
  );
}

// ── MODO WIZARD ────────────────────────────────────────────────────────────────

function WizardMode({
  pet,
  onResult,
  onSwitchToAudio,
}: {
  pet: PetProfile;
  onResult: (r: ScreeningResult) => void;
  onSwitchToAudio: () => void;
}) {
  const [step, setStep] = useState<WizardStep>('salud');
  const [data, setData] = useState<WizardData>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const esHembra = pet.sexo === 'hembra';
  const esMacho  = pet.sexo === 'macho';

  const nextStep = (current: WizardStep): WizardStep => {
    if (current === 'salud') return 'peso';
    if (current === 'peso') return 'vacunas';
    if (current === 'vacunas') return esHembra ? 'reproductivo' : esMacho ? 'criptorquidismo' : 'tratamientos';
    if (current === 'reproductivo') return 'tratamientos';
    if (current === 'criptorquidismo') return 'tratamientos';
    return 'resumen';
  };

  const advance = (update: Partial<WizardData>) => {
    const next = nextStep(step);
    setData(d => ({ ...d, ...update }));
    setStep(next);
  };

  const buildResult = (): ScreeningResult => {
    const alertas: string[] = [];
    let apto = true;
    let razon: string | undefined;

    if (!data.saludOk) {
      apto = false;
      razon = 'El animal presenta signos de enfermedad o malestar activo. Consultá a un veterinario antes de la cirugía.';
    }
    if (data.estadoReproductivo === 'prenada' || data.estadoReproductivo === 'celo') {
      apto = false;
      razon = data.estadoReproductivo === 'prenada'
        ? `${pet.nombre} está embarazada — la cirugía no puede realizarse en este momento.`
        : `${pet.nombre} está en celo — recomendamos esperar y reagendar.`;
    }
    if (data.criptorquidismo) {
      alertas.push('Criptorquidismo reportado — requiere procedimiento especializado');
    }
    if (data.estadoReproductivo === 'lactando') {
      alertas.push('Hembra lactando — verificar edad de cachorros el día del evento');
    }
    if (data.tratamientosActivos) {
      alertas.push(`Tratamiento activo: ${data.tratamientosActivos}`);
    }
    if (!data.vacunasAlDia) {
      alertas.push('Vacunas no confirmadas al día — traer cartilla de vacunación');
    }

    return {
      condicionSaludRaw: data.condicionSaludRaw,
      pesoKg: data.pesoKg,
      vacunasAlDia: data.vacunasAlDia,
      estadoReproductivo: data.estadoReproductivo,
      criptorquidismo: data.criptorquidismo,
      tratamientosActivos: data.tratamientosActivos,
      aptoCirugia: apto,
      razonRechazo: razon,
      alertasVet: alertas,
    };
  };

  const handleSubmitWizard = async () => {
    setSaving(true);
    setError('');
    try {
      // Enviar datos del wizard como texto al endpoint estándar de screening
      // (reutilizamos la misma lógica de evaluación pero con datos ya estructurados)
      const API = process.env['NEXT_PUBLIC_API_URL'] ?? '';
      const { fetchAuthSession } = await import('aws-amplify/auth');
      const session = await fetchAuthSession();
      const token = session.tokens?.idToken?.toString();

      const result = buildResult();

      await fetch(`${API}/pets/${pet.petId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          condicionSaludRaw: result.condicionSaludRaw,
          pesoKg: result.pesoKg,
          vacunasAlDia: result.vacunasAlDia,
          estadoReproductivo: result.estadoReproductivo,
          criptorquidismo: result.criptorquidismo,
          tratamientosActivos: result.tratamientosActivos,
          aptoCirugia: result.aptoCirugia,
          razonRechazo: result.razonRechazo,
          alertasVet: result.alertasVet,
          screenedAt: new Date().toISOString(),
        }),
      });

      onResult(result);
    } catch (err: unknown) {
      setError((err as Error).message || 'Error guardando datos');
    } finally {
      setSaving(false);
    }
  };

  // ── Pantallas del wizard ───────────────────────────────────────────────────

  if (step === 'salud') {
    return (
      <WizardCard
        step={1} totalSteps={esHembra || esMacho ? 5 : 4}
        pregunta={`¿Cómo está ${pet.nombre} hoy?`}
        descripcion="¿Está activo/a, come bien y no tiene síntomas como vómitos, diarrea o fiebre?"
        onSwitchToAudio={onSwitchToAudio}
      >
        <div className="space-y-3">
          <BigOptionButton
            emoji="😊" label="Está muy bien" sublabel="Activo/a, come y bebe normal"
            onClick={() => advance({ saludOk: true, condicionSaludRaw: 'Animal sano, sin síntomas' })}
            color="green"
          />
          <BigOptionButton
            emoji="😐" label="Tiene algo menor" sublabel="Leve, pero activo/a"
            onClick={() => {
              const detail = prompt(`¿Qué tiene ${pet.nombre}?`) ?? 'Condición menor';
              advance({ saludOk: true, condicionSaludRaw: detail });
            }}
            color="amber"
          />
          <BigOptionButton
            emoji="😟" label="Está enfermo/a" sublabel="Vómitos, fiebre, diarrea u otro"
            onClick={() => advance({ saludOk: false, condicionSaludRaw: 'Animal con síntomas activos' })}
            color="red"
          />
        </div>
      </WizardCard>
    );
  }

  if (step === 'peso') {
    const [pesoInput, setPesoInput] = useState(String(pet.pesoKg ?? ''));
    return (
      <WizardCard
        step={2} totalSteps={esHembra || esMacho ? 5 : 4}
        pregunta={`¿Cuánto pesa ${pet.nombre}?`}
        descripcion="Podés pesar a tu mascota en una balanza de baño o en la veterinaria."
        onSwitchToAudio={onSwitchToAudio}
      >
        <div className="space-y-4">
          <div className="relative">
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              value={pesoInput}
              onChange={e => setPesoInput(e.target.value)}
              placeholder="Ej: 8.5"
              aria-label="Peso de la mascota en kilogramos"
              className="w-full border-2 rounded-2xl px-5 py-4 text-2xl font-bold text-center focus:outline-none focus:border-brand-500"
            />
            <span className="absolute right-5 top-1/2 -translate-y-1/2 text-gray-400 font-semibold text-lg">kg</span>
          </div>

          {/* Referencia visual de pesos */}
          <div className="grid grid-cols-3 gap-2 text-center text-xs text-gray-500">
            {[
              { label: 'Gato adulto', peso: '3-5 kg' },
              { label: 'Perro chico', peso: '5-10 kg' },
              { label: 'Perro grande', peso: '20+ kg' },
            ].map(r => (
              <div key={r.label} className="bg-gray-50 rounded-xl px-2 py-2">
                <p className="font-semibold text-gray-700">{r.peso}</p>
                <p>{r.label}</p>
              </div>
            ))}
          </div>

          <button
            onClick={() => advance({ pesoKg: parseFloat(pesoInput) || undefined })}
            disabled={!pesoInput || parseFloat(pesoInput) <= 0}
            className="w-full bg-brand-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-brand-700 transition-colors disabled:opacity-40 min-h-[56px] focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-400"
          >
            Continuar →
          </button>
          <button
            onClick={() => advance({ pesoKg: undefined })}
            className="w-full text-gray-500 text-sm py-2 hover:text-gray-700 focus:outline-none"
          >
            No sé el peso exacto — omitir
          </button>
        </div>
      </WizardCard>
    );
  }

  if (step === 'vacunas') {
    return (
      <WizardCard
        step={3} totalSteps={esHembra || esMacho ? 5 : 4}
        pregunta={`¿${pet.nombre} tiene las vacunas al día?`}
        descripcion="Si tenés la cartilla de vacunación, verificá si están actualizadas."
        onSwitchToAudio={onSwitchToAudio}
      >
        <div className="space-y-3">
          <BigOptionButton emoji="✅" label="Sí, al día" sublabel="Tiene todas las vacunas"
            onClick={() => advance({ vacunasAlDia: true })} color="green" />
          <BigOptionButton emoji="❓" label="No sé / Sin cartilla" sublabel="No tengo la información exacta"
            onClick={() => advance({ vacunasAlDia: false })} color="amber" />
          <BigOptionButton emoji="❌" label="No, le faltan" sublabel="Vacunas atrasadas"
            onClick={() => advance({ vacunasAlDia: false })} color="red" />
        </div>
      </WizardCard>
    );
  }

  if (step === 'reproductivo' && esHembra) {
    return (
      <WizardCard
        step={4} totalSteps={5}
        pregunta={`¿Cuál es el estado de ${pet.nombre}?`}
        descripcion="Para hembras es importante saberlo antes de la cirugía."
        onSwitchToAudio={onSwitchToAudio}
      >
        <div className="space-y-3">
          <BigOptionButton emoji="✅" label="Normal" sublabel="Sin embarazo, celo ni cachorros"
            onClick={() => advance({ estadoReproductivo: 'normal' })} color="green" />
          <BigOptionButton emoji="🌡️" label="En celo" sublabel="Con sangrado o comportamiento de celo"
            onClick={() => advance({ estadoReproductivo: 'celo' })} color="amber" />
          <BigOptionButton emoji="🤰" label="Embarazada" sublabel="Preñada"
            onClick={() => advance({ estadoReproductivo: 'prenada' })} color="red" />
          <BigOptionButton emoji="🍼" label="Amamantando" sublabel="Tiene cachorros lactando"
            onClick={() => advance({ estadoReproductivo: 'lactando' })} color="amber" />
        </div>
      </WizardCard>
    );
  }

  if (step === 'criptorquidismo' && esMacho) {
    return (
      <WizardCard
        step={4} totalSteps={5}
        pregunta={`¿${pet.nombre} tiene los dos testículos normales?`}
        descripcion="A veces uno o los dos testículos no bajan — eso no impide la operación pero requiere un procedimiento distinto."
        onSwitchToAudio={onSwitchToAudio}
      >
        <div className="space-y-3">
          <BigOptionButton emoji="✅" label="Sí, los dos normales" sublabel="Ambos visibles y normales"
            onClick={() => advance({ criptorquidismo: false })} color="green" />
          <BigOptionButton emoji="⚠️" label="Uno o los dos no bajaron" sublabel="Criptorquidismo"
            onClick={() => advance({ criptorquidismo: true })} color="amber" />
          <BigOptionButton emoji="❓" label="No sé" sublabel="No estoy seguro/a"
            onClick={() => advance({ criptorquidismo: false })} color="neutral" />
        </div>
      </WizardCard>
    );
  }

  if (step === 'tratamientos') {
    const [tratInput, setTratInput] = useState('');
    const [tieneTratatamiento, setTieneTratamiento] = useState<boolean | null>(null);

    if (tieneTratatamiento === null) {
      return (
        <WizardCard
          step={esHembra || esMacho ? 5 : 4} totalSteps={esHembra || esMacho ? 5 : 4}
          pregunta={`¿${pet.nombre} toma algún medicamento?`}
          descripcion="Pastillas, inyecciones, antiparasitarios o cualquier tratamiento activo."
          onSwitchToAudio={onSwitchToAudio}
        >
          <div className="space-y-3">
            <BigOptionButton emoji="💊" label="Sí, está en tratamiento" sublabel="Toma medicamentos ahora"
              onClick={() => setTieneTratamiento(true)} color="amber" />
            <BigOptionButton emoji="✅" label="No, ninguno" sublabel="Sin medicamentos activos"
              onClick={() => advance({ tratamientosActivos: undefined })} color="green" />
          </div>
        </WizardCard>
      );
    }

    return (
      <WizardCard
        step={esHembra || esMacho ? 5 : 4} totalSteps={esHembra || esMacho ? 5 : 4}
        pregunta="¿Qué medicamento está tomando?"
        descripcion="Escribí el nombre del medicamento o tratamiento."
        onSwitchToAudio={onSwitchToAudio}
      >
        <div className="space-y-4">
          <textarea
            value={tratInput}
            onChange={e => setTratInput(e.target.value)}
            rows={3}
            placeholder="Ej: Amoxicilina 250mg, antiparasitario externo, etc."
            aria-label="Descripción del tratamiento activo"
            className="w-full border-2 rounded-2xl px-4 py-3 text-base focus:outline-none focus:border-brand-500 resize-none"
          />
          <button
            onClick={() => advance({ tratamientosActivos: tratInput || undefined })}
            disabled={!tratInput.trim()}
            className="w-full bg-brand-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-brand-700 transition-colors disabled:opacity-40 min-h-[56px] focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-400"
          >
            Continuar →
          </button>
        </div>
      </WizardCard>
    );
  }

  // Resumen final
  const finalResult = buildResult();
  return (
    <div className="space-y-4">
      <div className={`rounded-2xl px-5 py-5 ${finalResult.aptoCirugia ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
        <p className={`text-2xl font-bold mb-1 ${finalResult.aptoCirugia ? 'text-green-800' : 'text-red-800'}`}>
          {finalResult.aptoCirugia ? '✅ ¡Todo bien!' : '❌ Cirugía no recomendada'}
        </p>
        {finalResult.aptoCirugia
          ? <p className="text-green-700">{pet.nombre} puede participar en la feria de castración.</p>
          : <p className="text-red-700">{finalResult.razonRechazo}</p>
        }
      </div>

      {finalResult.alertasVet.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
          <p className="font-bold text-amber-800 mb-2">⚠️ El veterinario debe saber:</p>
          <ul className="space-y-1">
            {finalResult.alertasVet.map((a, i) => (
              <li key={i} className="text-amber-700 text-sm">• {a}</li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <div role="alert" className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700 text-sm">
          ❌ {error}
        </div>
      )}

      <button
        onClick={() => void handleSubmitWizard()}
        disabled={saving}
        aria-busy={saving}
        className="w-full bg-brand-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-brand-700 transition-colors disabled:opacity-40 min-h-[56px] focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-400"
      >
        {saving ? '⏳ Guardando…' : '💾 Confirmar y guardar'}
      </button>
    </div>
  );
}

// ── Helper: tarjeta de wizard ──────────────────────────────────────────────────

function WizardCard({
  step, totalSteps, pregunta, descripcion, children, onSwitchToAudio,
}: {
  step: number;
  totalSteps: number;
  pregunta: string;
  descripcion: string;
  children: React.ReactNode;
  onSwitchToAudio: () => void;
}) {
  const pct = Math.round((step / totalSteps) * 100);
  return (
    <div className="space-y-5">
      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-xs text-gray-400 mb-1">
          <span>Pregunta {step} de {totalSteps}</span>
          <span>{pct}%</span>
        </div>
        <div className="h-2 bg-gray-100 rounded-full overflow-hidden" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-brand-500 rounded-full transition-all duration-300" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* Pregunta */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">{pregunta}</h2>
        <p className="text-gray-500 text-sm">{descripcion}</p>
      </div>

      {children}

      <button
        onClick={onSwitchToAudio}
        className="w-full text-brand-600 text-sm font-semibold py-2 hover:text-brand-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 rounded"
      >
        🎤 Mejor grabo un audio
      </button>
    </div>
  );
}

// ── Helper: botón de opción grande ────────────────────────────────────────────

type OptionColor = 'green' | 'amber' | 'red' | 'neutral';

function BigOptionButton({
  emoji, label, sublabel, onClick, color,
}: {
  emoji: string;
  label: string;
  sublabel: string;
  onClick: () => void;
  color: OptionColor;
}) {
  const colorMap: Record<OptionColor, string> = {
    green:   'border-green-200 hover:bg-green-50 hover:border-green-400',
    amber:   'border-amber-200 hover:bg-amber-50 hover:border-amber-400',
    red:     'border-red-200 hover:bg-red-50 hover:border-red-400',
    neutral: 'border-gray-200 hover:bg-gray-50 hover:border-gray-400',
  };

  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-4 border-2 rounded-2xl px-5 py-4 transition-all min-h-[64px] text-left focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-400 ${colorMap[color]}`}
    >
      <span className="text-3xl flex-shrink-0" aria-hidden="true">{emoji}</span>
      <div>
        <p className="font-bold text-gray-900 text-base">{label}</p>
        <p className="text-gray-500 text-sm">{sublabel}</p>
      </div>
    </button>
  );
}

// ── RESULTADO FINAL ────────────────────────────────────────────────────────────

function ResultScreen({
  result,
  petNombre,
  onDone,
}: {
  result: ScreeningResult;
  petNombre: string;
  onDone: () => void;
}) {
  return (
    <div className="space-y-5">
      {/* Estado de apto */}
      <div className={`rounded-2xl px-6 py-6 text-center ${result.aptoCirugia ? 'bg-green-50 border-2 border-green-300' : 'bg-red-50 border-2 border-red-300'}`}>
        <div className="text-5xl mb-3" aria-hidden="true">
          {result.aptoCirugia ? '🎉' : '😔'}
        </div>
        <h2 className={`text-2xl font-bold mb-2 ${result.aptoCirugia ? 'text-green-800' : 'text-red-800'}`}>
          {result.aptoCirugia ? `¡${petNombre} está listo/a!` : 'Cirugía no recomendada ahora'}
        </h2>
        <p className={`text-base ${result.aptoCirugia ? 'text-green-700' : 'text-red-700'}`}>
          {result.aptoCirugia
            ? 'Los datos de salud se guardaron. El veterinario los revisará el día de la feria.'
            : result.razonRechazo}
        </p>
      </div>

      {/* Datos extraídos */}
      {(result.pesoKg || result.edadMeses || result.vacunasAlDia !== undefined) && (
        <div className="bg-white border rounded-2xl px-5 py-4">
          <p className="font-bold text-gray-800 mb-3 text-sm uppercase tracking-wide">📋 Datos registrados</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {result.pesoKg && (
              <div>
                <p className="text-gray-400 text-xs">Peso</p>
                <p className="font-semibold text-gray-900">{result.pesoKg} kg</p>
              </div>
            )}
            {result.edadMeses && (
              <div>
                <p className="text-gray-400 text-xs">Edad</p>
                <p className="font-semibold text-gray-900">
                  {result.edadMeses >= 12 ? `${Math.floor(result.edadMeses / 12)} año${Math.floor(result.edadMeses / 12) !== 1 ? 's' : ''}` : `${result.edadMeses} meses`}
                </p>
              </div>
            )}
            {result.vacunasAlDia !== undefined && (
              <div>
                <p className="text-gray-400 text-xs">Vacunas</p>
                <p className={`font-semibold ${result.vacunasAlDia ? 'text-green-700' : 'text-amber-600'}`}>
                  {result.vacunasAlDia ? '✓ Al día' : '⚠ Revisar'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Alertas */}
      {result.alertasVet.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl px-5 py-4">
          <p className="font-bold text-amber-800 mb-2 text-sm">⚠️ El veterinario verá estas alertas:</p>
          <ul className="space-y-1">
            {result.alertasVet.map((a, i) => <li key={i} className="text-amber-700 text-sm">• {a}</li>)}
          </ul>
        </div>
      )}

      <button
        onClick={onDone}
        className="w-full bg-brand-600 text-white py-4 rounded-2xl font-bold text-lg hover:bg-brand-700 transition-colors min-h-[56px] focus:outline-none focus-visible:ring-4 focus-visible:ring-brand-400"
      >
        ✅ Listo — Volver a mis mascotas
      </button>
    </div>
  );
}

// ── PAGE ───────────────────────────────────────────────────────────────────────

type InputMode = 'audio' | 'wizard';

export default function ScreeningPage() {
  const params = useParams();
  const router = useRouter();
  const petId = params['petId'] as string;

  const [pet, setPet] = useState<PetProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<InputMode>('audio');
  const [result, setResult] = useState<ScreeningResult | null>(null);

  useEffect(() => {
    getPet(petId)
      .then(p => setPet(p))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, [petId]);

  if (loading) {
    return (
      <div className="max-w-md mx-auto px-4 py-8 space-y-4">
        <div className="animate-pulse">
          <div className="h-14 bg-gray-100 rounded-2xl mb-6" />
          <div className="h-40 bg-gray-100 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!pet) {
    return (
      <div className="max-w-md mx-auto px-4 py-8">
        <div role="alert" className="bg-red-50 border border-red-200 rounded-2xl px-5 py-4 text-red-700">
          Mascota no encontrada.
          <button onClick={() => router.push('/mis-mascotas')} className="ml-2 underline">Volver</button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto px-4 py-8">
      {/* Back button */}
      <button
        onClick={() => router.push('/mis-mascotas')}
        className="text-brand-600 text-sm font-semibold mb-6 flex items-center gap-1 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 rounded"
        aria-label="Volver a mis mascotas"
      >
        ← Volver
      </button>

      <PetHeader pet={pet} />

      {/* Título de sección */}
      {!result && (
        <div className="mb-6">
          <h2 className="text-lg font-bold text-gray-900">Pre-evaluación médica</h2>
          <p className="text-gray-500 text-sm mt-1">
            Necesitamos algunos datos de salud antes de la cirugía. Toma menos de 2 minutos.
          </p>
        </div>
      )}

      {/* Contenido principal */}
      {result ? (
        <ResultScreen
          result={result}
          petNombre={pet.nombre}
          onDone={() => router.push('/mis-mascotas')}
        />
      ) : mode === 'audio' ? (
        <AudioMode
          pet={pet}
          onResult={setResult}
          onSwitchToWizard={() => setMode('wizard')}
        />
      ) : (
        <WizardMode
          pet={pet}
          onResult={setResult}
          onSwitchToAudio={() => setMode('audio')}
        />
      )}
    </div>
  );
}
