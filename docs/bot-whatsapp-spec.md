# CastraCR — Especificación Completa del Bot de WhatsApp

> Versión: 1.0 · Fecha: Mayo 2026  
> Stack: AWS Lambda (TypeScript) · Twilio · Claude Haiku 4.5 · DynamoDB · Next.js 14

---

## 1. Visión General

El bot de WhatsApp guía al dueño de mascota desde el **primer mensaje hasta el QR de confirmación**, pasando por el screening médico automático, selección de campaña y turno. Después de la cirugía, el bot regresa automáticamente para el **seguimiento post-operatorio** en los días 1, 3, 7 y 15.

### Flujos principales

| Flujo | Descripción | Trigger |
|-------|-------------|---------|
| **Registro** | Dueño agenda una o varias mascotas para castración | Dueño inicia conversación |
| **Post-op** | Seguimiento médico automatizado días 1/3/7/15 | Sistema envía primer mensaje |

### Principios de diseño

- **Voz como canal primario** — todo el flujo funciona 100% con mensajes de voz (Haiku transcribe)
- **Cero re-ingreso** — datos guardados en estado TTL 24h; si el dueño vuelve, retoma donde quedó
- **Respuestas estructuradas** — Haiku usa `tool_choice: 'tool'` para garantizar JSON, nunca texto libre
- **Accesibilidad** — frases cortas, sin jerga técnica, botones WhatsApp en vez de texto libre donde sea posible

---

## 2. Autenticación y Seguridad

### Webhook entrante (Twilio → Lambda)

```
POST /webhooks/whatsapp
```

Validación obligatoria antes de procesar cualquier mensaje:

```typescript
const valid = validateTwilioSignature(
  twilioAuthToken,
  event.headers['X-Twilio-Signature'],
  webhookUrl,
  parsedBody
);
if (!valid) return { statusCode: 403 };
```

### Rate limiting

| Ventana | Límite | Acción al superar |
|---------|--------|-------------------|
| 1 hora por número | 30 mensajes | Responde "Demasiados mensajes, intenta en 1 hora" |

DynamoDB: `RATE#${telefono} / HOURLY` con TTL 2h.

### API interna (bot → CastraCR)

El bot llama directamente a DynamoDB y a las APIs internas de CastraCR. No hay API key por organización — el bot opera con permisos IAM de la Lambda.

**Endpoints que consume el bot:**

| Operación | Método | Ruta | Notas |
|-----------|--------|------|-------|
| Campañas cercanas | GET | `/campaigns/nearby?lat&lng` | Pública |
| Slots por campaña | GET | `/campaigns/{id}` | Lee slots de metadata |
| Crear registro | Interno DDB | `crearRegistracionDesdeBot()` | Directo a DDB |
| Actualizar mascota | PATCH | `/pets/{petId}` | Guarda screening |
| Seguimiento post-op | Interno DDB | `appendSeguimiento()` | Directo a DDB |

---

## 3. Estructura de Datos del Bot

### ConversationState (DynamoDB)

```
PK: CONVERSATION#${telefono}
SK: WA_STATE
TTL: 24h (registro) | 16 días (postop)
```

```typescript
interface ConversationState {
  telefono: string;           // "whatsapp:+50688846636"
  modo: 'registro' | 'postop';
  estado: ConversationStep;

  // Datos acumulados del registro
  datos: {
    nombre?: string;
    especie?: 'perro' | 'gato' | 'otro';
    sexo?: 'macho' | 'hembra';
    pesoKg?: number;
    edadMeses?: number;
    condicionSaludRaw?: string;
    aptoCirugia?: boolean;
    razonRechazo?: string;
    alertasVet?: string[];
    estadoReproductivo?: 'prenada' | 'celo' | 'lactando' | 'normal';
    criptorquidismo?: boolean;
    vacunasAlDia?: boolean;
    tratamientosActivos?: string;
    provincia?: string;
    // Nuevos campos de la spec
    raza?: string;
    color?: string;
    microchip?: string;
    agresivo?: boolean;
    razaPeligrosa?: boolean;
    tieneBozal?: boolean;
    // Dueño
    ownerNombre?: string;
    ownerCedula?: string;
    ownerCanton?: string;
    esOrgRescate?: boolean;
    tutorLegal?: string;       // si dueño es menor de edad
    telefonoAlterno?: string;
  };

  // Selecciones
  campaignId?: string;
  slotId?: string;
  venueId?: string;
  regId?: string;
  petId?: string;

  // Post-op
  petNombre?: string;
  petEspecie?: string;
  postopDia?: 1 | 3 | 7 | 15;

  ttl: number;
}
```

### ConversationStep — todos los estados

```typescript
type ConversationStep =
  // Flujo de registro
  | 'inicio'
  | 'lookup_dueno'          // NUEVO: verificar si dueño ya existe
  | 'datos_dueno'           // NUEVO: capturar datos del dueño
  | 'datos_basicos'
  | 'datos_adicionales'     // NUEVO: raza, color, microchip
  | 'salud_general'
  | 'estado_reproductivo'
  | 'criptorquidismo'
  | 'raza_peligrosa'        // NUEVO: perros razas específicas
  | 'vacunas_tratamientos'
  | 'foto_mascota'          // NUEVO: foto opcional
  | 'direccion'
  | 'seleccion_campana'
  | 'seleccion_turno'
  | 'resumen_precio'        // NUEVO: mostrar precio antes de confirmar
  | 'confirmacion'
  | 'completado'
  // Segunda mascota (org rescate / múltiples)
  | 'otra_mascota'
  // Post-op
  | 'postop_seguimiento'
  | 'postop_completado';
```

---

## 4. Flujo de Registro — Estado por Estado

### Diagrama de flujo

```
inicio
  ↓
lookup_dueno ──── (dueño conocido) ──→ datos_basicos (pre-llenado)
  ↓ (nuevo)
datos_dueno
  ↓
datos_basicos
  ↓
datos_adicionales
  ↓
salud_general ──── (no apto) ──→ RECHAZADO (fin)
  ↓ (apto)
  ├── hembra → estado_reproductivo ──── (preñada/celo) ──→ RECHAZADA (fin)
  └── macho  → criptorquidismo ──────── (crypto=true) ──→ ALERTA (continúa)
  ↓
raza_peligrosa ──── (peligrosa sin bozal) ──→ RECHAZADO (fin)
  ↓
vacunas_tratamientos ──── (sin antirrábica) ──→ RECHAZADO + centros SENASA
  ↓
foto_mascota (opcional)
  ↓
direccion
  ↓
seleccion_campana ──── (sin campañas) ──→ WAITLIST (fin)
  ↓
seleccion_turno ──── (lleno) ──→ WAITLIST
  ↓
resumen_precio
  ↓
confirmacion ──── (cancelar) ──→ fin
  ↓
completado (QR enviado)
  ↓
otra_mascota (opcional, si org rescate)
```

---

### Estado: `inicio`

**Trigger:** cualquier mensaje al número del bot  
**Acción:** verificar si ya hay conversación activa en DDB

```
Si hay estado en DDB (TTL vigente):
  → Retomar donde quedó
  → "Hola de nuevo! Seguimos con el registro de [nombre]... 
     ¿Continuamos o prefieres empezar de nuevo?"

Si es conversación nueva:
  → Mensaje de bienvenida
```

**Mensaje de bienvenida:**
```
🐾 ¡Hola! Soy el asistente de CastraCR.

Te ayudo a agendar la esterilización de tu mascota de forma 
rápida y gratuita.

¿Empezamos? Cuéntame: ¿cómo se llama tu mascota y es perro o gato?

(Podés escribir o mandarme una nota de voz 🎤)
```

**→ Siguiente estado:** `lookup_dueno` (paralelo mientras el usuario responde)

---

### Estado: `lookup_dueno`

**Propósito:** verificar si el dueño ya tiene registro previo (pre-llenado automático)  
**DDB query:** buscar `USER#WA_${rawPhone}` o por teléfono en registros previos

```typescript
// Buscar registros previos del número
const prevReg = await ddb.send(new QueryCommand({
  TableName: TABLE_NAME,
  IndexName: 'GSI3',
  KeyConditionExpression: 'GSI3PK = :pk',
  ExpressionAttributeValues: { ':pk': `USER#WA_${rawPhone}` },
  Limit: 1,
}));
```

**Si encontrado:** pre-llenar `datos.ownerNombre`, `datos.ownerCedula`, `datos.ownerCanton`  
**→ Siguiente estado:** `datos_basicos` (saltar `datos_dueno`)

**Si no encontrado:**  
**→ Siguiente estado:** `datos_dueno`

---

### Estado: `datos_dueno`

**Propósito:** capturar datos del dueño (solo primera vez)  
**Mensaje:**
```
Para el registro necesito algunos datos tuyos.

¿Me decís tu nombre completo?
```

Luego en pasos cortos:
```
¿Y tu número de cédula? (o DIMEX/pasaporte)
```
```
¿En qué cantón vivís?
```

**Haiku tool:** `TOOL_DATOS_DUENO`
```json
{
  "nombre": "string",
  "tipoCedula": "cedula | dimex | pasaporte",
  "numeroCedula": "string",
  "canton": "string",
  "esMenorDeEdad": boolean,
  "tutorLegal": "string | null"
}
```

**Regla especial — menor de edad:**
```
Si esMenorDeEdad = true:
  → Preguntar nombre del tutor legal
  → guardar en datos.tutorLegal
```

**→ Siguiente estado:** `datos_basicos`

---

### Estado: `datos_basicos`

**Propósito:** nombre, especie, sexo, peso y edad de la mascota  
**Haiku tool:** `TOOL_DATOS_BASICOS`

```json
{
  "nombre": "string",
  "especie": "perro | gato | otro",
  "sexo": "macho | hembra",
  "pesoKg": number,
  "edadMeses": number
}
```

**Validaciones previas a Haiku (reglas de rechazo duro):**

| Condición | Respuesta |
|-----------|-----------|
| `edadMeses < 3` | Rechazo: "Muy joven (menos de 3 meses). Reagendá cuando tenga al menos 3 meses." |
| `pesoKg < 2` | Rechazo: "Muy bajo peso (menos de 2 kg). Consultá con un veterinario primero." |

**Si la especie es 'otro':**
```
Lo sentimos, por ahora solo atendemos perros y gatos 🐶🐱
```

**Mensaje si datos incompletos:**
```
Hmm, no pude entender bien. ¿Me decís el nombre, si es perro o gato, 
macho o hembra, cuánto pesa (en kilos) y qué edad tiene?
```

**→ Siguiente estado:** `datos_adicionales`

---

### Estado: `datos_adicionales`

**Propósito:** raza, color, microchip (datos del expediente)  
**Estos datos son opcionales** — si el usuario no los sabe, continuar igual.

**Mensaje:**
```
Algunos datos más sobre [nombre]:

¿De qué raza es? (o "mestizo/a" si no sabés)
¿De qué color es?
¿Tiene microchip? Si sí, ¿cuál es el número?

Si no sabés algo, podés responder "no sé" y continuamos.
```

**Haiku tool:** `TOOL_DATOS_ADICIONALES`
```json
{
  "raza": "string",
  "color": "string",
  "microchip": "string | null",
  "razaPeligrosaFlag": boolean
}
```

**Razas peligrosas** (flag para siguiente estado):
`pit bull`, `rottweiler`, `doberman`, `fila brasileiro`, `tosa`, `dogo argentino`, `american stafford`

**→ Siguiente estado:** `salud_general`

---

### Estado: `salud_general`

**Propósito:** screening médico — determinar si el animal es apto para cirugía  
**Mensaje:**
```
Ahora unas preguntas de salud para asegurarnos de que [nombre] 
pueda operarse sin riesgo.

¿[nombre] está bien de salud? ¿Tiene alguna enfermedad, síntoma 
o condición que debamos saber? (vómitos, fiebre, medicamentos, cirugías recientes...)

Podés contarme en tus palabras o mandame una nota de voz 🎤
```

**Haiku tool:** `TOOL_ELEGIBILIDAD`

```json
{
  "apto": boolean,
  "razon": "string | null",
  "alertas": ["string array"]
}
```

**System prompt para Haiku:**
```
Sos asistente de evaluación preoperatoria para campañas de 
castración en Costa Rica. Evaluá si el animal es apto para cirugía.

RECHAZAR (apto: false) si el dueño menciona:
- Vómitos, diarrea o fiebre activa
- Menos de 3 meses de edad o menos de 2 kg de peso
- Cirugía o anestesia en las últimas 3 semanas
- Diabetes, falla renal, falla hepática, convulsiones no controladas
- Animal moribundo o en estado crítico
- Sin vacuna antirrábica (evaluar en vacunas_tratamientos)

APROBAR con ALERTA (apto: true, alertas: [...]) si menciona:
- Criptorquidismo (un testículo no descendido) → alerta: "Criptorquidismo - procedimiento especializado"
- Medicamentos activos → listar en alertas
- Animal mayor a 8 años → alerta: "Animal geriátrico - evaluar en evento"
- Condición crónica controlada (hipotiroidismo, epilepsia controlada)

Si no menciona ningún problema → apto: true, alertas: []
```

**Si apto = false:**
```
⚠️ Lo sentimos, [nombre] no puede participar en esta campaña.

Razón: [razonRechazo]

[Si aplica: "Podés reagendar cuando: [condición resuelta]"]

¿Querés buscar otra campaña o te podemos avisar cuando [nombre] 
pueda participar?
```
**→ FIN del flujo** (estado: `completado` con `aptoCirugia: false`)

**Si apto = true:**

Guardar `alertasVet` si hay alertas.

Bifurcación por sexo:
- Hembra → `estado_reproductivo`
- Macho → `criptorquidismo`
- (Si ya se detectó en datos_adicionales: `razaPeligrosa = true`) → `raza_peligrosa`

---

### Estado: `estado_reproductivo` (solo hembras)

**Mensaje:**
```
Una pregunta importante para las hembras:

¿[nombre] está embarazada, en celo, amamantando cachorros, 
o ninguna de estas?

[✅ Ninguna] [🤰 Embarazada] [🌡️ En celo] [🍼 Amamantando]
```

**Haiku tool:** `TOOL_REPRODUCTIVO`
```json
{
  "estado": "prenada | celo | lactando | normal",
  "semanasGestacion": number | null,
  "semanasCachorros": number | null
}
```

**Rechazos:**

| Estado | Mensaje |
|--------|---------|
| `prenada` | "❌ No podemos operar a una hembra embarazada. Reagendá mínimo 45 días después del parto." |
| `celo` | "❌ Las hembras en celo tienen mayor riesgo quirúrgico. Reagendá mínimo 30 días después de que termine el celo." |
| `lactando` | "❌ No operamos hembras que estén amamantando. Reagendá cuando los cachorros tengan al menos 6 semanas y estén destetados." |
| `normal` | Continúa ✅ |

Si `lactando` y `semanasCachorros >= 6`:
```
Si los cachorros ya están comiendo solos y no dependen de [nombre] 
para alimentarse, ¿podríamos proceder? Confirmame esto.
```

**→ Siguiente estado:** `vacunas_tratamientos`

---

### Estado: `criptorquidismo` (solo machos)

**Mensaje:**
```
Pregunta rápida: ¿[nombre] tiene los dos testículos visibles 
y en su lugar?

[✅ Sí, los dos] [❓ Solo uno / no estoy seguro]
```

**Lógica:**
- Si `ambosTesticulos = true` → continuar sin alerta
- Si `ambosTesticulos = false` → agregar a `alertasVet`: "Posible criptorquidismo — procedimiento especializado requerido" + continuar (no rechaza, solo alerta al vet)

```
ℹ️ Anotamos que podría tener criptorquidismo. El veterinario 
lo confirmará el día del evento. Es operable pero puede requerir 
un procedimiento diferente.
```

**→ Siguiente estado:** `vacunas_tratamientos` (o `raza_peligrosa` si aplica)

---

### Estado: `raza_peligrosa` (solo si flagRazaPeligrosa = true)

**Mensaje:**
```
[nombre] es de una raza que requiere precauciones especiales.

¿[nombre] viene el día del evento con bozal puesto?

[✅ Sí, con bozal] [❌ No tengo bozal]
```

**Si no tiene bozal:**
```
⚠️ Por seguridad del personal veterinario, los perros de raza 
potencialmente peligrosa deben venir con bozal obligatorio.

Podés conseguir uno en cualquier veterinaria o ferretería. 
¿Querés que te agendemos para una campaña futura?
```
→ FIN (rechazo)

**Si tiene bozal:**
```
Perfecto ✅ Anotamos que viene con bozal.
```
→ Continúa con `vacunas_tratamientos`

---

### Estado: `vacunas_tratamientos`

**Mensaje:**
```
Últimas preguntas de salud:

¿[nombre] tiene las vacunas al día, incluyendo la antirrábica?
¿Está tomando algún medicamento actualmente?

[✅ Vacunas al día] [❌ Vacunas incompletas o no sé]
```

**Haiku tool:** `TOOL_SALUD_ADICIONAL`
```json
{
  "vacunasAlDia": boolean,
  "tieneAntiRabica": boolean,
  "tratamientosActivos": "string | null"
}
```

**Si sin antirrábica:**
```
⚠️ La vacuna antirrábica es obligatoria para participar en 
campañas de castración (normativa SENASA).

Centros de vacunación SENASA cercanos a [cantón]:
• Clínica Veterinaria SENASA [dirección]
• [otros centros]

Una vez que [nombre] tenga la vacuna, escribinos de nuevo 🐾
```
→ FIN (guardar estado para retomar)

**Si con antirrábica:**
- Guardar `vacunasAlDia: true` / `tratamientosActivos`
- Si hay tratamientos activos → agregar a `alertasVet`

**→ Siguiente estado:** `foto_mascota`

---

### Estado: `foto_mascota`

**Propósito:** foto opcional para el expediente  
**Mensaje:**
```
Opcional: ¿Querés enviar una foto de [nombre] para el expediente?

Puede ser una foto reciente. Formatos: JPG, PNG o HEIC, máximo 5MB.

Si no querés enviar foto, respondé "saltar" o "no" ✅
```

**Lógica:**
- Si recibe imagen (MediaContentType incluye `image/`):
  - Descargar con auth Twilio
  - Guardar URL en `datos.fotoUrl` (se adjuntará al crear pet)
  - "Foto recibida ✅"
- Si responde "no/saltar/omitir":
  - Continuar sin foto

**→ Siguiente estado:** `direccion`

---

### Estado: `direccion`

**Propósito:** obtener ubicación para buscar campañas cercanas  
**Mensaje:**
```
¿En qué provincia o cantón de Costa Rica estás?

Por ejemplo: "San José", "Tibás", "Heredia", "Cartago"...
```

**Lógica:**
- Extraer provincia/cantón del texto
- Convertir a coordenadas aproximadas (tabla lookup Costa Rica)
- Llamar `getCampanasCercanas(lat, lng)`

```typescript
const CANTONES_CR: Record<string, { lat: number; lng: number }> = {
  'san jose':  { lat: 9.9281, lng: -84.0907 },
  'tibas':     { lat: 9.9526, lng: -84.0844 },
  'heredia':   { lat: 9.9980, lng: -84.1197 },
  'cartago':   { lat: 9.8648, lng: -83.9197 },
  'alajuela':  { lat: 10.0160, lng: -84.2148 },
  // ... todos los cantones principales
};
```

**Si no hay campañas activas:**
```
😔 No hay campañas disponibles cerca de [cantón] en este momento.

¿Querés que te avisemos cuando haya una nueva campaña en tu zona?

[✅ Sí, avisame] [❌ No, gracias]
```
→ Si acepta: guardar en lista de espera geográfica → FIN

**→ Siguiente estado:** `seleccion_campana`

---

### Estado: `seleccion_campana`

**Propósito:** mostrar campañas y permitir seleccionar  
**Formato de lista** (WhatsApp List Message):

```
🐾 Campañas disponibles cerca de [cantón]:

1. Campaña Tibás — 14 jun 2026
   📍 Tibás, San José
   🐕 8 cupos perros | 🐱 4 cupos gatos
   💰 Perro: ₡10.000 | Gato: ₡8.000

2. Campaña San José Centro — 21 jun 2026
   📍 San José Centro
   🐕 12 cupos | 🐱 6 cupos
   💰 Perro: ₡12.000 | Gato: ₡9.000

¿Cuál te interesa? Respondé con el número.
```

**Si campaña seleccionada no tiene cupos para la especie:**
```
⚠️ Esta campaña ya no tiene cupos para [especie].
¿Querés quedar en lista de espera o elegir otra campaña?

[📋 Lista de espera] [🔄 Ver otras campañas]
```

**→ Siguiente estado:** `seleccion_turno`

---

### Estado: `seleccion_turno`

**Propósito:** seleccionar horario del día  
**Query:** buscar `CAMPAIGN#${campaignId} / SLOT#${slotId}#AVAIL` en DDB

**Formato:**
```
📅 Horarios disponibles para [campaña] el [fecha]:

08:00 ✅  08:30 ❌  09:00 ✅  09:30 ✅
10:00 ✅  10:30 ❌  11:00 ✅

¿Qué hora te viene mejor?
```

**Caso especial — múltiples mascotas (org rescate):**
```
Tenés [N] mascotas para registrar. 
¿Necesitás slots consecutivos (uno seguido del otro)?

[✅ Sí, consecutivos] [❌ No importa]
```

Si se piden consecutivos pero no están disponibles:
```
Solo hay slots separados disponibles:
• 08:00 y 10:30 (separados 2:30h)

Opciones:
[✅ Aceptar separados] [📋 Waitlist por consecutivos] [❌ Cancelar]
```

**Si quedan solo 1 slot para múltiples mascotas:**
```
Solo queda 1 slot disponible para [especie].
¿Cuál mascota querés priorizar?

[🐶 Firulais] [🐱 Michi]
```

**→ Siguiente estado:** `resumen_precio`

---

### Estado: `resumen_precio`

**Propósito:** mostrar precio total antes de confirmar (regla de negocio crítica)

**Cálculo:**
```typescript
const precio = calcularPrecio(campaign, datos);
// Incluye: precio base especie + extra criptorquidismo (si aplica)
// Precio especial si esOrgRescate = true y campaña tiene precioONG configurado
```

**Mensaje:**
```
💰 Resumen de precio:

🐶 [nombre] — [turno]
   Castración [especie]: ₡[precio_base]
   [+ Criptorquidismo: ₡5.000]  ← si aplica
   ─────────────────────────────
   Total: ₡[total]

💳 Métodos de pago aceptados:
   • Efectivo el día del evento
   • SINPE Móvil: [numero_sinpe]

📋 Política de cancelación:
   [cancellation_policy de la campaña]

¿Todo correcto?
[✅ Confirmar] [✏️ Cambiar algo]
```

**→ Siguiente estado:** `confirmacion`

---

### Estado: `confirmacion`

**Propósito:** confirmación final antes de crear el registro  
**Mensaje:**
```
✅ Confirma tu registro:

👤 Dueño: [nombre_dueno] · [cedula]
📍 Cantón: [canton]

🐾 Mascota: [nombre]
   [especie] · [sexo] · [raza] · [peso]kg · [edad]
   [color] [microchip si hay]

📅 [nombre campaña]
   📆 [fecha]
   ⏰ [turno]
   📍 [dirección venue]

💰 Total a pagar: ₡[total]
   Pago: efectivo/SINPE el día del evento

[✅ CONFIRMAR REGISTRO] [✏️ Cambiar datos] [❌ Cancelar]
```

**Si confirma:** ejecutar `crearRegistracionDesdeBot()`

**Si cambia algo:**
```
¿Qué querés cambiar?
[👤 Mis datos] [🐾 Datos de mascota] [📅 Campaña/horario]
```

**Si cancela:**
```
Entendido. Tu registro fue cancelado.
Si cambiás de opinión, escribinos cuando quieras 🐾
```

---

### Estado: `completado`

**Caso exitoso — slot disponible:**
```
🎉 ¡Registro confirmado!

Tu código de confirmación: *CASTRA-[código]*

📱 Guardá este QR para el día del evento:
[imagen QR URL: https://api.qrserver.com/v1/create-qr-code/?size=300x300&data={qrToken}]

📋 Instrucciones importantes:
• Ayuno de 12 horas antes de la cirugía
• Traer cédula y carnet de vacunas
• Gatos: obligatorio transportadora
[• Perros raza peligrosa: bozal obligatorio] ← si aplica

El día del evento mostrá este QR al llegar 📲

¿Tenés otra mascota que quieras registrar?
[🐾 Registrar otra] [✅ Listo, gracias]
```

**Caso lista de espera:**
```
📋 Quedaste en lista de espera

Posición: #[N]

Te avisaremos por WhatsApp si se libera un cupo para [nombre].

[✅ Entendido]
```

**→ Si "Registrar otra":** reiniciar `datos` y volver a `datos_basicos`  
(mantener datos del dueño pre-llenados)

---

## 5. Validaciones de Negocio

### Historial de mascota (evitar doble cirugía)

Al iniciar registro, verificar si el animal ya fue esterilizado:

```typescript
// Buscar por nombre + teléfono del dueño en registros completados
const query = await ddb.send(new QueryCommand({
  TableName: TABLE_NAME,
  IndexName: 'GSI3',
  KeyConditionExpression: 'GSI3PK = :pk',
  FilterExpression: 'estadoCirugia = :op',
  ExpressionAttributeValues: {
    ':pk': `USER#WA_${rawPhone}`,
    ':op': 'operado',
  },
}));
```

Si ya fue esterilizado:
```
⚠️ Según nuestros registros, [nombre] ya fue esterilizado 
en la campaña "[nombre campaña]" el [fecha].

Si creés que esto es un error, contactá a la organización directamente.
```

### Resumen de todas las reglas de rechazo (422)

| Condición | Mensaje |
|-----------|---------|
| Edad < 3 meses | "Muy joven — esperar hasta 3 meses" |
| Peso < 2 kg | "Muy bajo peso — consultar veterinario" |
| Hembra en celo | "Reagendar 30 días post-celo" |
| Hembra preñada | "Reagendar 45 días post-parto" |
| Hembra lactando | "Reagendar cuando cachorros >6 sem destetados" |
| Enfermedad activa | "Resolver condición médica primero" |
| Cirugía reciente <3 sem | "Esperar mínimo 3 semanas" |
| Sin antirrábica | "Vacunar en SENASA primero" |
| Raza peligrosa sin bozal | "Conseguir bozal obligatorio" |
| Ya esterilizado | "Historial indica cirugía previa" |
| Slot 409 | "Slot ocupado — ofrecer siguiente disponible" |

---

## 6. Flujo Post-Operatorio

### Trigger: `reminder-postop-init` (EventBridge rate 15min)

Detecta campañas con `fechaFin` en las últimas 15 minutos y envía el primer mensaje:

```
🏥 La operación de [nombre] fue exitosa.

Instrucciones para esta noche:
• Mantenelo en un lugar tranquilo y tibio
• No le des comida hasta mañana temprano
• El cono (collar isabelino) debe estar puesto
• Es normal que esté adormecido las primeras horas

Si ves sangrado activo, convulsiones o no reacciona:
→ Escribime URGENTE aquí mismo o llama a una clínica de emergencias

Te escribo mañana para ver cómo está [nombre] 🐾
```

### Trigger: `reminder-postop-followup` (EventBridge rate 30min)

Días 1, 3, 7, 15 post-cirugía:

```
🐾 ¡Buenos días! Han pasado [N] día(s) desde la operación de [nombre].

¿Cómo está? Contame cómo se ve la herida, si está comiendo y si 
está activo/a. Podés escribir o mandame una nota de voz 🎤
```

### Estado: `postop_seguimiento`

**Haiku tool:** `TOOL_POSTOP`

```json
{
  "nivel": "normal | observacion | urgente",
  "descripcion": "string (1 oración)",
  "signosPreocupantes": ["string array"]
}
```

**System prompt dinámico por día:**
```
Sos asistente veterinario evaluando post-op de castración.
Día {N} post-cirugía. Especie: {especie}.

URGENTE — atención veterinaria inmediata:
- Sangrado activo (más de unas gotitas)
- Herida abierta o con pus
- No come ni bebe en más de 24h
- Convulsiones
- Jadeo excesivo sin causa
- Abdomen muy hinchado o duro
- Animal sin reaccionar o inconsciente
- Temperatura >40°C que el dueño reporte

OBSERVACIÓN — monitorear de cerca:
- Leve hinchazón alrededor de la herida (día 1-3)
- Lamido leve de la herida (recordar usar cono)
- Algo de letargo el primer día
- Poco apetito primeras 12h post-cirugía

NORMAL — recuperación esperada:
- Animal activo, jugando o caminando
- Comiendo y bebiendo normal
- Herida limpia, seca y cerrada
- Descansando más de lo habitual pero reactivo

NO des consejos médicos específicos. Solo clasificá y respondé
con el protocolo correspondiente al nivel.
```

**Respuestas por nivel:**

**NORMAL:**
```
¡Qué buenas noticias! [nombre] está recuperándose muy bien 🎉

[Día 1]: El siguiente chequeo es en 2 días (día 3).
[Día 3]: El siguiente chequeo es en 4 días (día 7). 
[Día 7]: ¡Casi listo! Último chequeo en 8 días (día 15).
[Día 15]: ¡[nombre] se ha recuperado completamente! 
          Que sigan muchos años juntos 🐾
```

**OBSERVACIÓN:**
```
Gracias por el reporte. Hay algunas cosas a vigilar:

[descripción]

Recomendaciones:
• Asegurate de que tenga el cono puesto
• Revisá la herida dos veces al día
• Si notás cambios, escribime

[próximo chequeo info]
```

**URGENTE:**
```
⚠️ ATENCIÓN: Lo que describís puede ser una complicación 
que necesita evaluación veterinaria HOY.

[signosPreocupantes listados]

Por favor:
1. Llevá a [nombre] a una clínica veterinaria inmediatamente
2. Avisá a la organización: [contacto org]

No doy consejos médicos — este caso necesita un veterinario.

Ya notifiqué a la organización de la campaña.
```

**→ Acciones automáticas en URGENTE:**
- Guardar en DDB: `POSTOP_RESPONSE#${regId}/D${dia}` con `nivel: 'urgente'`
- Actualizar `estadoCirugia → 'complicacion'` en registro
- Notificar al organizador vía WhatsApp

### Política de no-respuesta

Si el dueño no responde a los días 7, 10 y 15 (3 intentos):
```
[Intento 2 - día 10]:
🐾 Te escribí hace unos días para ver cómo está [nombre].
¿Todo bien? Mandame un mensaje cuando puedas.

[Intento 3 - día 15]:
Este es nuestro último recordatorio de seguimiento.
Si [nombre] tiene algún problema, escribinos o consultá 
a un veterinario. ¡Esperamos que esté bien! 🐾
```

Después de 3 intentos sin respuesta → marcar en DDB como `sin_seguimiento`.

---

## 7. Endpoints Nuevos Requeridos

Los siguientes endpoints deben crearse en el backend para soportar el bot completo.

### 7.1 `GET /api/owners/lookup`

**Ruta:** `GET /owners/lookup?phone={phone}`  
**Auth:** JWT (bot usa permisos IAM internamente)  
**Propósito:** pre-llenar datos del dueño si ya existe

**Respuesta 200:**
```json
{
  "data": {
    "found": true,
    "nombre": "María Pérez",
    "cedula": "1-1234-5678",
    "canton": "Tibás",
    "mascotas": [
      { "nombre": "Firulais", "especie": "perro", "petId": "pet-123" }
    ]
  }
}
```

**Implementación:** query por GSI3 con `USER#WA_${phone}`

---

### 7.2 `GET /api/pets/history`

**Ruta:** `GET /pets/history?phone={phone}&nombre={nombre}`  
**Propósito:** verificar si mascota ya fue esterilizada (previene doble cirugía)

**Respuesta 200:**
```json
{
  "data": {
    "yaEsterilizado": false,
    "fechaCirugia": null,
    "campana": null
  }
}
```

---

### 7.3 `POST /api/campaigns/{id}/waitlist`

**Ruta:** `POST /campaigns/{id}/waitlist`  
**Body:**
```json
{
  "telefono": "50688846636",
  "ownerNombre": "María Pérez",
  "petNombre": "Michi",
  "especie": "gato",
  "razon": "sin_cupos | slots_no_consecutivos | mascota_no_apta_temporal"
}
```

**Respuesta 201:**
```json
{
  "data": {
    "posicion": 3,
    "waitlistId": "wl-xxx"
  }
}
```

**DDB:** `WAITLIST#${campaignId} / ${timestamp}#${telefono}`

---

### 7.4 `PATCH /api/appointments/{id}/reschedule`

**Ruta:** `PATCH /registrations/{regId}/reschedule`  
**Body:**
```json
{ "nuevoSlotId": "slot-xxx" }
```

**Lógica:**
1. Verificar que el nuevo slot tiene cupos
2. Decrementar nuevo slot atómicamente
3. Incrementar slot anterior
4. Actualizar registro con nuevo `slotId` y `turnoHora`

---

### 7.5 `DELETE /api/appointments/{id}`

**Ruta:** `POST /registrations/{id}/cancel` (ya existe — verificar lógica de reembolso)

Agregar campo `reembolsoElegible: boolean` en respuesta según política de la campaña.

---

### 7.6 `GET /api/campaigns/{id}/slots`

**Ruta:** `GET /campaigns/{id}/slots?especie=perro|gato`  
**Propósito:** listar slots disponibles filtrados por especie

**Respuesta 200:**
```json
{
  "data": {
    "slots": [
      { "slotId": "slot-1", "hora": "08:00", "disponible": true },
      { "slotId": "slot-2", "hora": "08:30", "disponible": false },
      { "slotId": "slot-3", "hora": "09:00", "disponible": true }
    ]
  }
}
```

---

## 8. Haiku Tools — Especificación Completa

### TOOL_DATOS_BASICOS
```typescript
{
  name: 'extraer_datos_mascota',
  description: 'Extrae nombre, especie, sexo, peso y edad de la mascota del mensaje del dueño',
  input_schema: {
    type: 'object',
    properties: {
      nombre:    { type: 'string' },
      especie:   { type: 'string', enum: ['perro', 'gato', 'otro'] },
      sexo:      { type: 'string', enum: ['macho', 'hembra'] },
      pesoKg:    { type: 'number' },
      edadMeses: { type: 'number' },
    },
    required: ['nombre', 'especie', 'sexo'],
  },
}
```

### TOOL_DATOS_DUENO
```typescript
{
  name: 'extraer_datos_dueno',
  description: 'Extrae datos del dueño para el registro',
  input_schema: {
    type: 'object',
    properties: {
      nombre:        { type: 'string' },
      tipoCedula:    { type: 'string', enum: ['cedula', 'dimex', 'pasaporte'] },
      numeroCedula:  { type: 'string' },
      canton:        { type: 'string' },
      esMenorDeEdad: { type: 'boolean' },
      tutorLegal:    { type: ['string', 'null'] },
    },
    required: ['nombre', 'canton'],
  },
}
```

### TOOL_DATOS_ADICIONALES
```typescript
{
  name: 'extraer_datos_adicionales',
  description: 'Extrae raza, color y microchip de la mascota',
  input_schema: {
    type: 'object',
    properties: {
      raza:            { type: 'string' },
      color:           { type: 'string' },
      microchip:       { type: ['string', 'null'] },
      razaPeligrosaFlag: { type: 'boolean' },
    },
    required: ['raza', 'color'],
  },
}
```

### TOOL_ELEGIBILIDAD
```typescript
{
  name: 'evaluar_elegibilidad_cirugia',
  description: 'Evalúa si el animal es apto para cirugía de castración',
  input_schema: {
    type: 'object',
    properties: {
      apto:   { type: 'boolean' },
      razon:  { type: ['string', 'null'] },
      alertas: { type: 'array', items: { type: 'string' } },
    },
    required: ['apto', 'alertas'],
  },
}
```

### TOOL_REPRODUCTIVO
```typescript
{
  name: 'evaluar_estado_reproductivo',
  description: 'Evalúa el estado reproductivo de hembras',
  input_schema: {
    type: 'object',
    properties: {
      estado:           { type: 'string', enum: ['prenada', 'celo', 'lactando', 'normal'] },
      semanasGestacion: { type: ['number', 'null'] },
      semanasCachorros: { type: ['number', 'null'] },
    },
    required: ['estado'],
  },
}
```

### TOOL_SALUD_ADICIONAL
```typescript
{
  name: 'extraer_salud_adicional',
  description: 'Extrae estado de vacunas y tratamientos activos',
  input_schema: {
    type: 'object',
    properties: {
      vacunasAlDia:       { type: 'boolean' },
      tieneAntiRabica:    { type: 'boolean' },
      tratamientosActivos: { type: ['string', 'null'] },
    },
    required: ['vacunasAlDia', 'tieneAntiRabica'],
  },
}
```

### TOOL_POSTOP
```typescript
{
  name: 'evaluar_estado_postop',
  description: 'Evalúa el estado post-operatorio según reporte del dueño',
  input_schema: {
    type: 'object',
    properties: {
      nivel:              { type: 'string', enum: ['normal', 'observacion', 'urgente'] },
      descripcion:        { type: 'string' },
      signosPreocupantes: { type: 'array', items: { type: 'string' } },
    },
    required: ['nivel', 'descripcion', 'signosPreocupantes'],
  },
}
```

---

## 9. Manejo de Medios (Audio e Imagen)

### Audio (notas de voz WhatsApp)

```typescript
if (mediaContentType?.startsWith('audio/')) {
  // 1. Descargar con Twilio Basic Auth
  const audioBase64 = await fetchAudioBase64(mediaUrl, accountSid, authToken);
  
  // 2. Pasar a Haiku como contenido multimedia
  const messages = [{
    role: 'user',
    content: [
      { type: 'text', text: systemPromptForCurrentStep },
      {
        type: 'document',  // Haiku acepta audio como document
        source: { type: 'base64', media_type: 'audio/ogg', data: audioBase64 },
      },
    ],
  }];
  
  // Haiku transcribe Y extrae datos en una sola llamada
}
```

### Imagen (foto de mascota)

```typescript
if (mediaContentType?.startsWith('image/')) {
  // Estado foto_mascota: guardar URL de Twilio CDN
  // La imagen se descargará y subirá a S3 al crear el registro
  stateUpdate.datos = { ...state.datos, fotoUrlTwilio: mediaUrl };
}
```

---

## 10. Administración del Bot (Comandos de Staff)

El staff de CastraCR puede enviar comandos al número del bot:

| Comando | Función |
|---------|---------|
| `/noshow CASTRA-789` | Marcar no-show, liberar slot, notificar waitlist |
| `/cancelar-campana CAMP-001 razón` | Cancelación masiva con notificación a todos |
| `/reducir CAMP-001 perros:10 gatos:5` | Reducir capacidad, mover excedente a waitlist |
| `/extender CAMP-001 perros:5` | Añadir slots y notificar waitlist |

**Validación:** verificar que el número de teléfono pertenece a grupo `Organizador` o `SuperAdmin` en Cognito.

---

## 11. Estado de Conversación — Gestión de Timeouts

### TTL por modo

| Modo | TTL | Comportamiento al expirar |
|------|-----|---------------------------|
| `registro` (incompleto) | 24h | Próximo mensaje inicia flujo nuevo |
| `registro` (completado) | 24h | Solo responde a "registrar otra mascota" |
| `postop` | 16 días | Permite respuestas en cualquier día de los 16 |

### Slot expirado durante flujo

Si el slot seleccionado expiró entre cuando se eligió y cuando se confirmó:

```
⚠️ El horario que elegiste (09:00) ya fue tomado mientras 
completabas el registro.

Horarios disponibles ahora:
• 10:00 ✅
• 11:00 ✅

¿Cuál te queda mejor?
```

### Race condition en confirmación (409)

```typescript
try {
  await ddb.send(new UpdateCommand({
    // ConditionExpression: cuposDisponibles > :zero
  }));
} catch (e) {
  if (e.name === 'ConditionalCheckFailedException') {
    // Slot ocupado — buscar siguiente disponible
    return { reply: SLOT_OCUPADO_MSG, nextState: 'seleccion_turno' };
  }
}
```

---

## 12. DynamoDB — Keys Nuevas

```
WAITLIST#${campaignId}   / ${timestamp}#${telefono}     → lista de espera
OWNER#${telefono}        / PROFILE                       → perfil dueño (lookup)
PET_HISTORY#${telefono}  / ${petNombre}                  → historial de mascotas
```

---

## 13. Variables de Entorno Requeridas

```env
# Existentes
DYNAMODB_TABLE_NAME=castrar-cr-dev
SECRET_ARN=arn:aws:secretsmanager:...

# En Secrets Manager (ya existentes)
TWILIO_ACCOUNT_SID=ACxxxx
TWILIO_AUTH_TOKEN=xxxx
TWILIO_WHATSAPP_NUMBER=whatsapp:+506xxxx
ANTHROPIC_API_KEY=sk-ant-xxxx

# Nuevas (agregar al secret)
SENASA_API_KEY=xxxx            # para centros de vacunación cercanos (opcional)
BOT_ADMIN_PHONES=50688888888,50699999999  # números de staff autorizados
```

---

## 14. Estimación de Costos de IA

| Operación | Llamadas/registro | Costo Haiku aprox. |
|-----------|------------------|-------------------|
| Datos básicos (texto) | 1 | $0.0004 |
| Screening salud | 1 | $0.0005 |
| Estado reproductivo | 0.5 (solo hembras) | $0.0002 |
| Datos adicionales | 1 | $0.0003 |
| Vacunas/tratamientos | 1 | $0.0003 |
| Audio (50% usan voz) | ~2 | $0.0008 |
| Post-op seguimiento (4 días) | 4 | $0.0020 |
| **Total por mascota** | | **~$0.004** |

Con 50 mascotas/campaña: **< $0.20 de IA por campaña** ✅

---

## 15. Secuencia de Implementación

### Sprint 1 — Fundamentos del dueño y datos adicionales

1. Agregar estados `lookup_dueno`, `datos_dueno`, `datos_adicionales`, `raza_peligrosa`, `resumen_precio` al handler
2. Agregar tools `TOOL_DATOS_DUENO`, `TOOL_DATOS_ADICIONALES`
3. Crear endpoint `GET /owners/lookup`
4. Crear endpoint `GET /pets/history`
5. Crear endpoint `GET /campaigns/{id}/slots`
6. Actualizar `crearRegistracionDesdeBot()` para incluir datos del dueño y foto

### Sprint 2 — Waitlist y reprogramación

1. Crear endpoint `POST /campaigns/{id}/waitlist`
2. Crear endpoint `PATCH /registrations/{id}/reschedule`
3. Implementar lógica de slots consecutivos
4. Implementar lógica de 1 slot para múltiples mascotas
5. Notificación automática a waitlist cuando se libera slot

### Sprint 3 — Post-op completo

1. Completar `reminder-postop-init` y `reminder-postop-followup` (ya existen como lambdas)
2. Conectar `handlePostopReply()` con `appendSeguimiento()` real
3. Implementar alerta automática al organizador en nivel URGENTE
4. Lógica de 3 intentos sin respuesta → `sin_seguimiento`

### Sprint 4 — Comandos de staff

1. Implementar `/noshow`, `/cancelar-campana`, `/reducir`, `/extender`
2. Validación de teléfonos de staff en Cognito
3. Panel en admin para ver estado de waitlist

---

## 16. Verificación QA

```
✅ Registro normal (texto):
   Mandar "Hola" → flujo completo → QR en ~8 mensajes

✅ Registro con audio:
   Mandar nota de voz en cada paso → mismo resultado

✅ Rechazo por enfermedad:
   "Está vomitando desde ayer" → 422 + mensaje apropiado

✅ Rechazo hembra preñada:
   "Está embarazada de 3 semanas" → 422 + fecha reagendar

✅ Alerta criptorquidismo:
   "Solo tiene un testículo" → aprobado + alerta al vet

✅ Sin antirrábica:
   "No tiene vacunas" → 422 + centros SENASA

✅ Race condition slot:
   Confirmar slot que ya se ocupó → ofrece alternativa

✅ Dueño regresa dentro de 24h:
   Mensaje nuevo → retoma donde quedó

✅ Post-op normal día 1:
   "Está bien, comió bien" → nivel normal + próximo chequeo

✅ Post-op urgente:
   "Tiene la herida muy inflamada con pus" → nivel urgente + alerta org

✅ Tres intentos sin respuesta:
   No contestar días 7/10/15 → marcado sin_seguimiento
```
