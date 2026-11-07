# 🍽️🤒 FoodTracker

Registra lo que comes y las reacciones que te provocan a lo largo del año. Siéntate, escribe, y la hora se registra automáticamente.

## Stack
- **Frontend**: React + Vite + Tailwind CSS (PWA, instalable en Android)
- **Backend/DB**: Supabase (PostgreSQL con Auth + Row Level Security)
- **Offline**: IndexedDB (Dexie) con sincronización automática → funciona sin internet

## Requisitos previos
- Node.js ≥ 20
- Un proyecto Supabase gratuito (https://supabase.com)

## Setup inicial (una sola vez)

### 1. Configurar Supabase
1. Entra al Dashboard de tu proyecto → **Settings → API** y copia:
   - `Project URL`
   - Publishable (anon) key
2. Pon esas credenciales en `client/.env`:
   ```env
   VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
   VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xxxx
   ```
3. En el **SQL Editor** de Supabase, pega y ejecuta `database/schema.sql` y luego `database/seed.sql` (reacciones estándar).
4. Opcional (recomendado para la demo): en **Authentication → Sign In / Providers → Email**, desactiva *Confirm email* o confirma el email desde el Dashboard cuando crees el usuario.

### 2. Instalar y correr
```bash
cd client
npm install
npm run dev          # http://localhost:5173
```

### 3. Probar en el celular
- Con la app corriendo, entra a `http://localhost:5173` desde tu móvil **en la misma red WiFi**.
- O haz build y despliégalo:
```bash
npm run build
npm run preview
```
- En Android: abre en Chrome → menú → *Instalar aplicación* para usarla como app nativa (requiere conexión https en producción).

## Características
- 📝 **Registro con autocompletado**: escribe "arroz" y te sugiere comidas/reacciones ya guardadas; si no existe, se crea al guardar.
- ⏰ **Hora automática**: no escribes la hora nunca.
- 🤒 **Reacciones independientes o asociadas**: una reacción puede ir ligada a una de las comidas de hoy o ser libre.
- 📶 **Offline-first**: todo se guarda en tu dispositivo al instante y se sincroniza con el cloud cuando hay internet.
- 📜 **Historial en timeline y tabla** (agrupado por día).
- 📊 **Estadísticas**: comidas y reacciones más frecuentes, severidad y actividad de los últimos 30 días.

## Estructura
```
client/               # App React PWA
  src/components/     # Autocomplete, formularios, historial, stats, auth
  src/hooks/          # useSync (Dexie ↔ Supabase)
  src/lib/            # supabase.js, db.js (Dexie)
  scripts/            # gen-icons.ps1
database/
  schema.sql          # Tablas + RLS
  seed.sql            # Reacciones estándar
```

## Despliegue en Vercel
1. Sube la carpeta `D:\BeatIt` a GitHub.
2. En Vercel importa el repo → **Root Directory: `client`** → Framework: Vite.
3. Añade las variables de entorno `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`.
4. Deploy. La PWA ya queda servida con Service Worker (https necesario).