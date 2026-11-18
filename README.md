# Plataforma-de-aprendizaje-de-ingl-s

## Entorno Node.js del frontend

El repositorio utiliza un único gestor de paquetes para el ecosistema JavaScript: **pnpm**.

Versiones fijadas:
- Node.js **26.13.1 LTS** (también indicada en `.nvmrc` y `.node-version`).
- pnpm **12.21.0** (declarado en `package.json` mediante `packageManager`).
- El lockfile de todo el workspace es `pnpm-lock.yaml`, ubicado en la raíz.

Instala pnpm una vez en tu equipo si todavía no está disponible:

```bash
npm install --global pnpm@12.21.0
```

Este comando solo instala la herramienta pnpm; no instala dependencias del proyecto. Todas las dependencias del workspace se gestionan con pnpm:

```bash
pnpm install --frozen-lockfile
cp frontend/.env.example frontend/.env.local
```

Configura `NEXT_PUBLIC_BFF_URL` en `frontend/.env.local` con el origen de BFF de tu entorno de desarrollo. Después puedes iniciar, compilar o revisar el frontend desde la raíz:

```bash
pnpm --filter devfluency-frontend dev
pnpm --filter devfluency-frontend lint
pnpm --filter devfluency-frontend build
```

No uses `npm install`, `npm ci`, `npm run`, `npx` ni Bun para instalar o ejecutar el workspace. CI y despliegue verifican el lockfile con `pnpm install --frozen-lockfile`.
