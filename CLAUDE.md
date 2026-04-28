# CastraCR — Contexto del Proyecto para Claude

> Plataforma de gestión de campañas de esterilización de mascotas para Costa Rica (castrar.cr).  
> Conecta dueños de mascotas, veterinarios y organizaciones rescatistas.

---

## Estructura del Monorepo

```
D:/InHouse/CastraCR/
├── apps/
│   ├── web/          # Next.js 14 - frontend público
│   └── admin/        # Dashboard admin
├── packages/
│   ├── types/        # Tipos TypeScript compartidos
│   ├── ui/           # Componentes React (Button, Badge, Card)
│   └── utils/        # Geohash, QR, sanitize, errors
├── lambdas/
│   ├── shared/       # DB (DynamoDB), auth, response, secrets
│   ├── api/          # REST endpoints
│   ├── events/       # Jobs programados (EventBridge)
│   └── webhooks/     # OnvoPay + WhatsApp (Twilio + Claude AI)
└── infra/            # AWS CDK (auth, data, storage, secrets, events, notif stacks)
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

- `SuperAdmin` — Acceso total
- `Organizador` — Crea/gestiona campañas
- `Veterinario` — Veterinarios participantes
- `Dueno` — Dueños de mascotas

---

## Lógica de Negocio Clave

- **Modelo:** Precios por volumen (campañas y cupos por mes)
- **Planes:** Libre $0 · Starter $9 · Pro $19 · Escala $34 (todos recurrentes excepto Libre)
- **ONG discount:** 30% automático en cualquier plan pagado → $6.30 / $13.30 / $23.80
- **Límites por plan:**
  - Libre: 1 campaña/mes, 25 cupos, sin WA bot, sin donaciones
  - Starter: 4 campañas/mes, 150 cupos, WA bot ✅, donaciones ❌
  - Pro: 12 campañas/mes, 600 cupos, WA bot ✅, donaciones ✅
  - Escala: ilimitado, WA bot ✅, donaciones ✅
- **Fee por feria:** 90% org / 10% plataforma (solo sobre pagos procesados por app — efectivo = 100% org)
- **Donaciones:** 100% org, plataforma no retiene nada
- **Distribución mensual:** Proporcional a votos — admin hace transferencias SINPE/IBAN manualmente (sin OnvoPay Connect)
- **Bot WhatsApp:** Claude AI registra mascotas — Haiku para texto, Sonnet 4 para imágenes
- **Búsqueda campañas:** Geohash ~5km radio (GSI2)
- **QR de check-in:** UUID opaco generado al registrar mascota

---

## DynamoDB — Single-Table Design

### Keys principales

```
CAMPAIGN#{id}      / METADATA
ORG#{id}           / PROFILE
USER#{userId}      / PROFILE
REG#{regId}        / METADATA
DONATION#{id}      / METADATA
CONVERSATION#{tel} / WA_STATE          (TTL 24h)
RATE#{tel}         / HOURLY            (TTL 2h)
ONVOPAY_EVENT#{id} / PROCESSED         (idempotencia webhook)
VOTE#{YYYY-MM}     / ORG#{id}
```

### Keys adicionales

```
QR#{qrToken}           / REG               → lookup O(1) para check-in
CAMPAIGN#{id}          / SLOT#{sid}#AVAIL  → cuposDisponibles atómico
CAMPAIGN#{id}          / VENUE#{vid}#AVAIL
USER_VET#{userId}      / VET_REF           → evita duplicados de vet
REMINDER#{regId}       / 24H|2H            → idempotencia de reminders
DIST#{YYYY-MM}         / ORG#{id}          → audit de distribución mensual
```

### GSIs

| GSI | Key |
|-----|-----|
| GSI1 | organizador |
| GSI2 | geohash |
| GSI3 | userId |
| GSI4 | estado |

---

## APIs Implementadas

### Lambdas API (`lambdas/api/`)

- `campaigns/` — create, get, list-nearby
- `pets/` — create, get, list
- `pets/upload-url.ts` — POST /pets/{petId}/upload-url (S3 pre-signed PUT)
- `pets/update-photo.ts` — PUT /pets/{petId}/photo (persiste s3Key)
- `registrations/` — create, get, list, cancel
- `checkin/scan` — check-in por QR token
- `donations/` — create-intent, list
- `vets/` — register, approve, list
- `impact/get` — stats por campaña o plataforma
- `admin/campaigns/` — create, update (venues/slots/vets), publish, list
- `admin/orgs/update.ts` — PATCH /admin/orgs/{orgId} (sinpeMovil, iban, nombreBanco)

### Webhooks (`lambdas/webhooks/`)

- `onvopay/handler.ts` — payment_intent.succeeded + actualiza GSI3/GSI4 en donaciones
- `whatsapp/handler.ts` — Bot Claude AI

### Events (`lambdas/events/`)

- `monthly-close` — query donaciones via GSI4, audit trail en DDB
- `notify-waitlist` — DDB Streams → promueve waitlist + SES email
- `release-slots` — limpieza de availability negativa
- `reminder-24h` / `reminder-2h` — SES emails con idempotencia

---

## Apps

### `apps/web` (Next.js, puerto 3002)

Rutas: `/`, `/campanas`, `/campanas/[id]`, `/mis-mascotas`, `/mis-registros`, `/donar`, `/auth/login`

### `apps/admin` (Next.js, puerto 3001)

Rutas: `/campanas`, `/campanas/nueva`, `/campanas/[id]`, `/checkin`, `/vets`, `/orgs`

---

## UI Design System

- **Paleta:** cyan/teal — `brand-500 = #06b6d4`, `brand-600 = #0891b2`
- **Font:** Inter (Google Fonts vía next/font)
- **Layout:** hero gradiente azul por página, cards `rounded-3xl shadow-sm`
- **Nav mobile:** BottomNav fijo 5 items | **Nav desktop:** Navbar sticky con blur
- **CSS utilities en globals.css:** `.btn-primary`, `.btn-outline`, `.card`, `.input-field`, `.skeleton`
- **Animaciones:** `animate-shimmer` (loading), `animate-fade-up` (cards)
- `viewport: Viewport` exportado separado del `metadata` (Next.js 14)

### Landing page (`apps/web/src/app/page.tsx`)

- SVG inline: `DogSvg`, `CatSvg`, `PawSvg`
- Hero: 8 huellas dispersas + dog+cat esquina inferior-derecha (opacity 0.18)
- Strip "Perros y gatos bienvenidos" entre stats y pasos (cyan-50 gradient)
- Eyebrow tag: `🐕 🐈 Costa Rica · Servicio gratuito`

---

## CDK Deploy Dev — cuenta 798694628803 / us-east-1

| Stack | Estado | Detalle |
|-------|--------|---------|
| CastraCr-Notif-dev | ✅ | SES |
| CastraCr-Data-dev | ✅ | DynamoDB `castrar-cr-dev` |
| CastraCr-Storage-dev | ✅ | S3 `castrar-cr-photos-dev`, CDN `d5b1xz1cyyesg.cloudfront.net` |
| CastraCr-Secrets-dev | ✅ | ARN `arn:aws:secretsmanager:us-east-1:798694628803:secret:castrar-cr-dev-secrets-Kc2ZUl` |
| CastraCr-Auth-dev | ✅ | Cognito `us-east-1_uyNWfjXDh`, Client `57des3m55vjjkfjujp6gsp1avt` |
| CastraCr-Api-dev | ✅ | API Gateway `https://p0cd41b095.execute-api.us-east-1.amazonaws.com` |

**Detalles API Stack:**
- 25+ Lambdas desplegadas, JWT Authorizer con Cognito
- EventBridge: monthly-close, release-slots, reminder-24h, reminder-2h
- DDB Streams → notify-waitlist Lambda

**CDK Pendiente (próximo deploy):**
- Nuevas lambdas: `petUploadUrl`, `petUpdatePhoto`, `adminOrgUpdate`, `onvoPayWebhook`
- Env vars: `PHOTOS_BUCKET_NAME`, `CDN_DOMAIN`
- `photosBucket.grantPut(petUploadUrl)` en ApiStack
- Ruta webhook: `/webhooks/onvopay`
- Ruta nueva: `PATCH /admin/orgs/{orgId}`

**Notas CDK:**
- Bundling: usar `X86_64` (no ARM64) en Windows sin Docker
- esbuild en root `node_modules`
- Lambda deps en root `package.json`: `@anthropic-ai/sdk`, `twilio`, `uuid`
- Fix: `auth-stack.ts` debe usar `castrar-cr-${props.appEnv}-secrets` (no hardcoded)

---

## CI/CD

- `develop` → deploy dev
- `main` → deploy staging
- tag `v*` → deploy prod (con approval gate)
- GitHub Actions: `.github/workflows/backend.yml`, `frontend.yml`

---

## .env.local (apps/web y apps/admin)

```env
NEXT_PUBLIC_USER_POOL_ID=us-east-1_uyNWfjXDh
NEXT_PUBLIC_USER_POOL_CLIENT_ID=57des3m55vjjkfjujp6gsp1avt
NEXT_PUBLIC_API_URL=https://p0cd41b095.execute-api.us-east-1.amazonaws.com
NEXT_PUBLIC_ONVOPAY_PUBLIC_KEY=           # pendiente configurar
NEXT_PUBLIC_CDN_URL=https://d5b1xz1cyyesg.cloudfront.net
```

SuperAdmin: `jason.rbm@gmail.com` en Cognito grupo SuperAdmin

---

## OnvoPay (reemplazó Stripe — Mar 2026)

- API: `POST https://api.onvopay.com/v1/payment-intents` con Bearer token
- JS SDK: `<script src="https://js.onvopay.com/v1/onvopay.js">` → `window.OnvoPay.init({ publicKey })` → `window.OnvoPay.mount('#selector', { amount, currency, paymentToken, onSuccess, onError })`
- Retorna `{ paymentToken, paymentIntentId, amount }` (no `clientSecret` como Stripe)
- Secrets AWS: `ONVOPAY_SECRET_KEY`, `ONVOPAY_WEBHOOK_SECRET`
- Idempotencia webhook: clave `ONVOPAY_EVENT#` (antes `PAYMENT_EVENT#`)
- Orgs tienen campos bancarios: `sinpeMovil`, `iban`, `nombreBanco`

---

## Dev Server en Windows

```jsonc
// .vscode/launch.json
{
  "runtimeExecutable": "node",
  "runtimeArgs": ["D:\\InHouse\\CastraCR\\node_modules\\next\\dist\\bin\\next", "dev", "--port", "3002"],
  "cwd": "D:\\InHouse\\CastraCR\\apps\\web"
}
```

- Admin: mismo patrón, `cwd` → `apps/admin`, port `3001`
- Matar proceso en port: `Get-NetTCPConnection -LocalPort 3002 | ... | Stop-Process`
- taskkill en bash: `cmd /c "taskkill /PID <pid> /F"`

---

## TypeScript Gotchas

| Problema | Solución |
|----------|----------|
| Tailwind opacity no-estándar (`/13`, `/14`, `/16`, `/18`) no se generan en JIT | Usar `style={{ color: 'rgba(255,255,255,0.14)' }}` |
| `noUncheckedIndexedAccess`: `array[idx]` retorna `T \| undefined` aunque haya length guard | Usar `array[idx]!` |
| Narrowing en arrays | `const [first] = data; first!.lat` en vez de `data[0].lat` |
