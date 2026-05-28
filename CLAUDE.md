# CastraCR — Contexto completo para Claude

> Plataforma de gestión de campañas de esterilización de mascotas para Costa Rica (castrar.cr).
> Conecta dueños de mascotas, veterinarios y organizaciones rescatistas.

---

## Estructura del Monorepo

```
D:/InHouse/CastraCR/
├── apps/
│   ├── web/          # Next.js 14 — frontend público (puerto 3002)
│   └── admin/        # Next.js 14 — dashboard admin (puerto 3001)
├── packages/
│   ├── types/        # Tipos TypeScript compartidos
│   ├── ui/           # Componentes React (Button, Badge, Card)
│   └── utils/        # Geohash, QR, sanitize, errors
├── lambdas/
│   ├── shared/       # DB (DynamoDB), auth, response, secrets
│   ├── api/          # REST endpoints
│   ├── events/       # Jobs programados (EventBridge)
│   └── webhooks/     # OnvoPay + WhatsApp (Twilio + Claude AI)
├── infra/            # AWS CDK (auth, data, storage, secrets, events, notif stacks)
└── docs/             # piloto.html, piloto.pdf
```

---

## Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Frontend | Next.js 14, React 18, Tailwind CSS, AWS Amplify (auth) |
| Backend | AWS Lambda (TypeScript), DynamoDB single-table |
| Pagos | OnvoPay (reemplazó Stripe en Mar 2026) |
| Notificaciones | Twilio (WhatsApp), SES (email) |
| AI | Claude AI — Haiku (texto), Sonnet 4 (imágenes) vía Anthropic SDK |
| Infra | AWS CDK, Cognito, S3/CloudFront, EventBridge |
| Build | Turbo monorepo, Node.js 20, TypeScript 5.7.2 |

---

## Roles de Usuario

- `SuperAdmin` — Acceso total (jason.rbm@gmail.com)
- `Organizador` — Crea/gestiona campañas
- `Veterinario` — Veterinarios participantes
- `Dueno` — Dueños de mascotas

---

## Lógica de Negocio Clave

- **Planes:** Libre $0 · Starter $9 · Pro $19 · Escala $34 (recurrentes excepto Libre)
- **ONG discount:** 30% automático → $6.30 / $13.30 / $23.80
- **Límites por plan:**
  - Libre: 1 campaña/mes, 25 cupos, sin WA bot, sin donaciones
  - Starter: 4 campañas/mes, 150 cupos, WA bot ✅, donaciones ❌
  - Pro: 12 campañas/mes, 600 cupos, WA bot ✅, donaciones ✅
  - Escala: ilimitado, WA bot ✅, donaciones ✅
- **Fee por feria:** 90% org / 10% plataforma (sobre pagos en app; efectivo = 100% org)
- **Donaciones:** 100% org, plataforma no retiene nada
- **Distribución mensual:** Proporcional a votos — SINPE/IBAN manual (no OnvoPay Connect)
- **Bot WhatsApp:** Claude AI registra mascotas — Haiku texto, Sonnet 4 imágenes
- **Búsqueda campañas:** Geohash ~5km radio (GSI2)
- **QR de check-in:** UUID opaco generado al registrar mascota

---

## DynamoDB — Single-Table Design

### Keys existentes

```
CAMPAIGN#{id}      / METADATA
ORG#{id}           / PROFILE
USER#{userId}      / PROFILE
REG#{regId}        / METADATA
DONATION#{id}      / METADATA
CONVERSATION#{tel} / WA_STATE          (TTL 24h — extender a 16d en modo postop)
RATE#{tel}         / HOURLY            (TTL 2h)
ONVOPAY_EVENT#{id} / PROCESSED         (idempotencia webhook)
VOTE#{YYYY-MM}     / ORG#{id}
QR#{qrToken}       / REG               → lookup O(1) para check-in
CAMPAIGN#{id}      / SLOT#{sid}#AVAIL  → cuposDisponibles atómico
CAMPAIGN#{id}      / VENUE#{vid}#AVAIL
USER_VET#{userId}  / VET_REF           → evita duplicados de vet
REMINDER#{regId}   / 24H|2H            → idempotencia de reminders
DIST#{YYYY-MM}     / ORG#{id}          → audit distribución mensual
```

### Keys planeadas (próximo desarrollo)

```
REG#{regId}              / EXPEDIENTE           → expediente clínico por procedimiento
CAMPAIGN#{id}            / COSTS                → costos de la campaña
POSTOP_DUE#{yyyy-mm-dd}  / #{regId}#D#{dia}     → scheduling post-op
REMINDER#{regId}         / POSTOP_INIT|D1|D3|D7|D15
POSTOP_RESPONSE#{regId}  / D#{dia}
```

### GSIs

| GSI | PK | Uso |
|-----|----|-----|
| GSI1 | organizador | Campañas por org |
| GSI2 | geohash | Búsqueda por ubicación |
| GSI3 | userId | Registros/donaciones por usuario |
| GSI4 | estado | Filtrar por estado |
| GSI_POSTOP (planeado) | POSTOP_DUE_DATE | Scheduling post-op |

---

## APIs Implementadas

### Lambdas API (`lambdas/api/`)

- `campaigns/` — create, get, list-nearby
- `pets/` — create, get, list, upload-url, update-photo
- `registrations/` — create, get, list, cancel
- `checkin/scan` — check-in por QR token
- `donations/` — create-intent, list
- `vets/` — register, approve, list
- `impact/get` — stats por campaña o plataforma
- `admin/campaigns/` — create, update (venues/slots/vets), publish, list
- `admin/orgs/update.ts` — PATCH /admin/orgs/{orgId} (sinpeMovil, iban, nombreBanco)

### Webhooks (`lambdas/webhooks/`)

- `onvopay/handler.ts` — payment_intent.succeeded + actualiza GSI3/GSI4
- `whatsapp/handler.ts` — Bot Claude AI (⚠️ state machine dead code — necesita reescritura)

### Events (`lambdas/events/`)

- `monthly-close` — audit trail donaciones via GSI4
- `notify-waitlist` — DDB Streams → promueve waitlist + SES
- `release-slots` — limpieza availability negativa
- `reminder-24h` / `reminder-2h` — SES emails con idempotencia
- `reminder-postop-init` ✅ — detecta campañas finalizadas, envía WA noche, agenda días 1/3/7/15
- `reminder-postop-followup` ✅ — envía WA follow-up días 1/3/7/15, activa modo postop en bot

---

## Apps — Rutas

### `apps/web` (puerto 3002)
`/` · `/campanas` · `/campanas/[id]` · `/mis-mascotas` · `/mis-registros` · `/donar` · `/auth/login` · `/pagar/[id]`

### `apps/admin` (puerto 3001)
`/campanas` · `/campanas/nueva` · `/campanas/[id]` · `/checkin` · `/checkin/[regId]` · `/vets` · `/orgs`

---

## UI Design System

- **Paleta:** cyan/teal — `brand-500 = #06b6d4`, `brand-600 = #0891b2`, `brand-700 = #0e7490`
- **Font:** Inter (Google Fonts vía next/font)
- **Layout:** `main` tiene `md:px-4 md:py-6 md:max-w-5xl md:mx-auto`
- **Nav mobile:** `BottomNav` fijo 5 items | **Nav desktop:** `Navbar` sticky con blur
- **CSS utilities:** `.btn-primary`, `.btn-outline`, `.card`, `.input-field`, `.skeleton`
- **Animaciones:** `animate-shimmer` (loading), `animate-fade-up` (cards)
- `viewport: Viewport` exportado separado del `metadata` (Next.js 14)

### Hero estándar — TODAS las páginas internas (NO cambiar este patrón)

El layout aplica `md:px-4 md:py-6`. El wrapper `md:-mx-4 md:-mt-6` escapa ese padding para que el hero sea full-bleed en desktop.

```tsx
<div className="md:-mx-4 md:-mt-6">
  <div className="bg-gradient-to-br from-brand-700 via-brand-600 to-cyan-500 px-6 pt-6 pb-6 relative overflow-hidden">
    <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-white/10" />
    <div className="absolute bottom-0 -left-12 w-52 h-52 rounded-full bg-white/10" />
    <div className="absolute top-8 left-1/2 -translate-x-1/2 w-32 h-32 rounded-full bg-white/5" />
    <div className="max-w-md mx-auto relative text-center">
      <div className="inline-flex items-center gap-2.5 mb-4">
        <div className="w-11 h-11 rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-sm">
          <span className="text-2xl" aria-hidden>🐾</span>
        </div>
        <span className="text-xl font-bold text-white tracking-tight">CastraCR</span>
      </div>
      <h1 className="text-3xl font-extrabold text-white mb-2">{título}</h1>
      <p className="text-white/70 text-sm">{subtítulo}</p>
    </div>
  </div>
  {/* Contenido — SIEMPRE mt-4, NUNCA -mt-N */}
  <div className="px-4 mt-4 max-w-2xl mx-auto ...">
```

**Reglas estrictas:**
- Gradient: `from-brand-700 via-brand-600 to-cyan-500` — NO usar `from-brand-600`
- Contenido bajo el hero: `mt-4` — NUNCA `-mt-7` ni ningún overlap negativo
- Páginas con este hero: campanas, donar, mis-mascotas, mis-registros, campanas/[id], pagar/[id]
- Login: mismo hero pero con `min-h-[calc(100vh-4rem)] flex flex-col` (pantalla completa)

### Navbar — nombre de usuario

Usar `fetchUserAttributes()` de `aws-amplify/auth`, NO `getCurrentUser().username` (devuelve UUID de Cognito).
Prioridad: `attrs.name` → `attrs.email.split('@')[0]`

---

## CDK Deploy Dev — cuenta 798694628803 / us-east-1

| Stack | Estado | Detalle |
|-------|--------|---------|
| CastraCr-Notif-dev | ✅ | SES |
| CastraCr-Data-dev | ✅ | DynamoDB `castrar-cr-dev` |
| CastraCr-Storage-dev | ✅ | S3 `castrar-cr-photos-dev`, CDN `d5b1xz1cyyesg.cloudfront.net` |
| CastraCr-Secrets-dev | ✅ | ARN `…secret:castrar-cr-dev-secrets-Kc2ZUl` |
| CastraCr-Auth-dev | ✅ | Cognito `us-east-1_uyNWfjXDh`, Client `57des3m55vjjkfjujp6gsp1avt` |
| CastraCr-Api-dev | ✅ | API GW `https://p0cd41b095.execute-api.us-east-1.amazonaws.com` |

**CDK pendiente (próximo deploy):**
- Lambdas: `petUploadUrl`, `petUpdatePhoto`, `adminOrgUpdate`, `onvoPayWebhook`, `update-expediente`, `get-expediente`, `reminder-postop-init`, `reminder-postop-followup`
- Rutas: `PATCH /registrations/{regId}/expediente`, `GET /registrations/{regId}/expediente`, `PATCH /admin/orgs/{orgId}`, `POST /webhooks/onvopay`
- EventBridge: postop-init (rate 15min), postop-followup (rate 30min)
- GSI_POSTOP en data-stack.ts
- Env vars: `PHOTOS_BUCKET_NAME`, `CDN_DOMAIN`

**Notas CDK:**
- Bundling: `X86_64` (no ARM64) en Windows sin Docker
- esbuild en root `node_modules`
- Siempre deployar desde `infra/`: `cd infra && npx cdk deploy --all`

---

## Vercel Deploy — REGLAS CRÍTICAS

### Proyectos (NO confundirlos)

| Proyecto | ID | URL | Estado |
|---|---|---|---|
| `castrar-cr-web` | `prj_pAiMFc4DHiVqGZMQ2aD6O0tzlSnh` | castrar-cr-web.vercel.app | ✅ PRODUCCIÓN |
| `web` | `prj_JIruQKFdH1nM6zSKkXLNG0CnRVu8` | web-three-chi-50.vercel.app | ❌ stale |
| `castrar-cr-admin` | `prj_JUDTMSouWdijh5YCe1Db1WVT9Btp` | project-cwafo.vercel.app | ✅ Admin |

- OrgId: `team_HlSBZaDwObIPYsWQUIDaBTK1`
- Auth CLI: `/c/Users/jason/AppData/Roaming/xdg.data/com.vercel.cli/auth.json`

### Flujo de deploy web (SIEMPRE desde root del monorepo)

**NUNCA** desde `apps/web` — falla con `npm error 404 @castrar-cr/types`.

```bash
cd D:/InHouse/CastraCR
npx vercel link --project castrar-cr-web --yes   # si da error de project settings
npx vercel deploy --yes
npx vercel alias <url-deployment> castrar-cr-web.vercel.app  # alias NO se asigna solo
# Restaurar .vercel/project.json a admin:
echo '{"projectId":"prj_JUDTMSouWdijh5YCe1Db1WVT9Btp","orgId":"team_HlSBZaDwObIPYsWQUIDaBTK1","projectName":"castrar-cr-admin"}' > .vercel/project.json
```

`.vercel/project.json` normalmente apunta a **castrar-cr-admin**. Se cambia temporalmente a `castrar-cr-web` para deployar web, y se restaura después.

### Env vars en castrar-cr-web (Vercel)
`NEXT_PUBLIC_USER_POOL_ID`, `NEXT_PUBLIC_USER_POOL_CLIENT_ID`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_CDN_URL`
`NEXT_PUBLIC_ONVOPAY_PUBLIC_KEY` — **pendiente configurar**

---

## OnvoPay (reemplazó Stripe — Mar 2026)

- API: `POST https://api.onvopay.com/v1/payment-intents` con Bearer token
- Retorna `{ paymentToken, paymentIntentId, amount }` — NO `clientSecret` como Stripe
- JS SDK: `https://js.onvopay.com/v1/onvopay.js` → `window.OnvoPay.init({ publicKey })` → `.mount('#selector', { amount, currency, paymentToken, onSuccess, onError })`
- Secrets AWS: `ONVOPAY_SECRET_KEY`, `ONVOPAY_WEBHOOK_SECRET`
- Idempotencia webhook: `ONVOPAY_EVENT#` (antes `PAYMENT_EVENT#`)
- Orgs tienen: `sinpeMovil`, `iban`, `nombreBanco`

---

## .env.local (apps/web y apps/admin)

```env
NEXT_PUBLIC_USER_POOL_ID=us-east-1_uyNWfjXDh
NEXT_PUBLIC_USER_POOL_CLIENT_ID=57des3m55vjjkfjujp6gsp1avt
NEXT_PUBLIC_API_URL=https://p0cd41b095.execute-api.us-east-1.amazonaws.com
NEXT_PUBLIC_CDN_URL=https://d5b1xz1cyyesg.cloudfront.net
NEXT_PUBLIC_ONVOPAY_PUBLIC_KEY=           # pendiente
```

---

## Dev Server en Windows

```jsonc
// .vscode/launch.json — web
{
  "runtimeExecutable": "node",
  "runtimeArgs": ["D:\\InHouse\\CastraCR\\node_modules\\next\\dist\\bin\\next", "dev", "--port", "3002"],
  "cwd": "D:\\InHouse\\CastraCR\\apps\\web"
}
// admin: mismo, cwd → apps/admin, port 3001
```

- Matar proceso en port: `Get-NetTCPConnection -LocalPort 3002 | Select -Expand OwningProcess | Stop-Process`
- taskkill en bash: `cmd /c "taskkill /PID <pid> /F"`

---

## CI/CD

- `develop` → deploy dev | `main` → deploy staging | tag `v*` → prod (approval gate)
- GitHub Actions: `.github/workflows/backend.yml`, `frontend.yml`

---

## TypeScript Gotchas

| Problema | Solución |
|----------|----------|
| Tailwind opacity `/13` `/14` `/16` `/18` no se generan en JIT | `style={{ color: 'rgba(255,255,255,0.14)' }}` |
| `noUncheckedIndexedAccess`: `array[idx]` retorna `T \| undefined` | `array[idx]!` |
| Narrowing en arrays | `const [first] = data; first!.lat` |

---

## Plan de Desarrollo Activo

Plan completo: `C:\Users\jason\.claude\plans\generic-mapping-eclipse.md`

### Pendientes ordenados por prioridad

1. **Fix `RecepcionRapida`** — `apps/admin/src/app/checkin/page.tsx` usa `window.__authToken__` en vez de Amplify `fetchAuthSession()`
2. **Fix `reminder-postop-init`** — lee `reg['pets']` pero el campo en DDB es `petSummaries`
3. **Bot WhatsApp** — state machine dead code, necesita reescritura con dispatch table + Haiku tool-use
4. **CDK deploy** — lambdas nuevas, EventBridge, GSI_POSTOP, rutas expediente

### Bot WhatsApp — estado actual vs deseado

**Hoy:** chatbot libre sin estructura, `estado` nunca avanza, datos no se persisten al pet record.

**Deseado:** dispatch table con estados:
```
inicio → datos_basicos → salud_general → [estado_reproductivo: hembras]
→ [criptorquidismo: machos] → vacunas_tratamientos → direccion
→ seleccion_campana → seleccion_turno → confirmacion → completado
```
Modo `postop` paralelo para seguimiento días 1/3/7/15.

### Expediente Clínico — item DDB: `REG#{regId} / EXPEDIENTE`

4 fases: `recepcion` (peso, turno, consentimiento) → `preOp` (evaluación vet) → `intraOp` (tiempos, procedimiento) → `egreso` (antibiótico, cono, firma entrega)
+ `seguimiento[]` — respuestas post-op con clasificación IA (normal/observacion/urgente).
Lambda: `PATCH /registrations/{regId}/expediente` con campo `fase`.
