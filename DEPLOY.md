# Deployment Guide

Bu proje iki ayrı servis olarak deploy edilir:

| Servis | Platform | URL |
|--------|----------|-----|
| **API + Bot** | Railway | `https://your-app.railway.app` |
| **Dashboard** | Vercel | `https://your-app.vercel.app` |

---

## Adım 1 — Railway (API + Database)

### 1.1 Railway hesabı aç
1. [railway.app](https://railway.app) → "Login with GitHub"

### 1.2 Yeni proje oluştur
```
Railway Dashboard → "New Project" → "Deploy from GitHub repo"
→ Repo'yu seç → Deploy
```

### 1.3 PostgreSQL ekle
```
Railway project sayfası → "New" → "Database" → "Add PostgreSQL"
```
Railway otomatik olarak `DATABASE_URL` environment variable'ı inject eder.

### 1.4 Environment Variables ayarla

Railway Dashboard → Servisin üstüne tıkla → "Variables" tab:

```
# Zorunlu
DATABASE_URL          → Railway PostgreSQL'den otomatik gelir
NODE_ENV              → production
LOG_LEVEL             → info
LOG_PRETTY            → false

# API
API_PORT              → 3001
API_HOST              → 0.0.0.0
JWT_SECRET            → openssl rand -hex 32  (terminalde çalıştır)

# CORS — Vercel URL'ini buraya yaz (deploy ettikten sonra güncelle)
CORS_ORIGINS          → https://your-dashboard.vercel.app

# Lighter API (varsa)
LIGHTER_API_KEY       → api keyini buraya
LIGHTER_API_URL       → https://mainnet.zklighter.elliot.ai
LIGHTER_WS_URL        → wss://mainnet.zklighter.elliot.ai/stream

# GÜVENLİK — Bunlar default olarak böyle kalsın
DRY_RUN               → true
PAPER_TRADING         → true
ENABLE_LIVE_TRADING   → false
I_UNDERSTAND_THIS_MAY_LOSE_REAL_MONEY → false
```

### 1.5 Deploy
Railway otomatik deploy eder. Logları izle:
```
Railway → Servis → "View Logs"
```

Health check kontrol et:
```
https://your-app.railway.app/health
```
Şunu görmeli:
```json
{"status":"ok","mode":"DRY_RUN","dryRun":true,"botStatus":"STOPPED"}
```

---

## Adım 2 — Vercel (Dashboard)

### 2.1 Vercel hesabı aç
1. [vercel.com](https://vercel.com) → "Login with GitHub"

### 2.2 Import et
```
Vercel Dashboard → "New Project" → GitHub repo'yu import et
```

### 2.3 ÖNEMLİ — Root Directory ayarla
```
"Root Directory" → apps/dashboard   ← BU OLMADAN ÇALIŞMAZ
Framework Preset → Next.js          ← Otomatik algılamalı
```

### 2.4 Build Settings (override et)
```
Build Command:
  cd ../.. && pnpm install && pnpm --filter @lighter-bot/common build && pnpm --filter @lighter-bot/dashboard build

Output Directory: .next  (default)

Install Command: pnpm install
```

### 2.5 Environment Variables
```
NEXT_PUBLIC_API_URL  → https://your-app.railway.app
NEXT_PUBLIC_WS_URL   → wss://your-app.railway.app/ws
```

### 2.6 Deploy
"Deploy" butonuna bas. Build loglarını izle.

---

## Adım 3 — CORS güncelle

Vercel deploy tamamlanınca URL'ini al (örn: `https://lighter-bot.vercel.app`), 
Railway'de `CORS_ORIGINS` variable'ını güncelle:
```
CORS_ORIGINS → https://lighter-bot.vercel.app
```
Railway otomatik redeploy yapar.

---

## Sorun Giderme

### Railway build hatası: "pnpm not found"
nixpacks.toml dosyasının repoda olduğundan emin ol.

### Railway: "Cannot find module" hatası
Build sırası yanlış. nixpacks.toml'daki build adımlarını kontrol et — 
common → strategy → risk → execution → backtest → api sırasında olmalı.

Ek olarak `railway.toml` start komutunun workspace-aware olması gerekir:
`pnpm --filter @lighter-bot/api start:railway`
(root'ta direkt `node apps/api/dist/server.js` çalıştırmak Prisma context'ini bozabilir).

### Vercel: "Module not found @lighter-bot/common"
Root Directory'nin `apps/dashboard` olarak ayarlandığından emin ol.
Vercel ayarları: Project Settings → General → Root Directory.

### Vercel: Build Command hatası
Vercel'in monorepo için custom build command'a ihtiyacı var.
Settings → Git → "Ignored Build Step" boş olsun.

Önerilen command:
`pnpm --filter @lighter-bot/common build && pnpm --filter @lighter-bot/dashboard build`

### Dashboard WebSocket bağlanmıyor
- Railway URL'inin `wss://` (değil `ws://`) ile başladığından emin ol
- Railway → Settings → "Public Networking" açık olmalı

### Railway: Health check timeout
`healthcheckTimeout = 45` yeterli olmalı. Migration uzun sürüyorsa
Railway → Service Settings → Health Check timeout'u artır.

---

## Railway CLI ile deploy (alternatif)

```bash
# Railway CLI kur
npm install -g @railway/cli

# Login
railway login

# Proje oluştur
railway init

# Deploy
railway up

# Env variable ekle
railway variables set DRY_RUN=true
railway variables set NODE_ENV=production

# Logları izle
railway logs
```

---

## Vercel CLI ile deploy (alternatif)

```bash
# Vercel CLI kur
npm install -g vercel

# Dashboard klasörüne git
cd apps/dashboard

# Deploy
vercel

# Production deploy
vercel --prod
```

---

## Özet

```
GitHub Repo
    │
    ├──► Railway (API)    ← Bot logic, WebSocket, DB
    │         │
    │    PostgreSQL
    │
    └──► Vercel (Dashboard) ← Next.js UI
              │
         env: NEXT_PUBLIC_API_URL = Railway URL
```

Railway API URL'ini Vercel'e, Vercel URL'ini Railway CORS_ORIGINS'e yaz.
İkisi birbirini tanıyınca çalışır.
