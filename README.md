# Plataforma-de-aprendizaje-de-ingl-s

## Entorno Node.js del frontend

El repositorio utiliza un único gestor de paquetes para todo el ecosistema JavaScript: **pnpm**.

Versiones fijadas en el repositorio:
- Node.js **26.13.1 LTS** (archivos `.nvmrc` y `.node-version`).
- pnpm **12.21.0** (campo `packageManager` del `package.json` raíz).
- Lockfile único del workspace: `pnpm-lock.yaml`.

### Instalación inicial en Linux/macOS

pnpm 12 dispone de un ejecutable standalone; no requiere npm ni Node.js para instalarse. Instala la misma versión fijada por el repositorio:

```bash
curl -fsSL https://get.pnpm.io/install.sh | env PNPM_VERSION=12.21.0 sh -
```

Abre una terminal nueva (o carga el perfil de tu shell) y verifica:

```bash
pnpm --version
```

Debe mostrar `12.21.0`. Instala Node.js 26.13.1 LTS usando tu gestor de versiones habitual o la versión indicada por `.nvmrc` y `.node-version`.

### Instalar y ejecutar el proyecto

Desde la raíz del repositorio:

```bash
pnpm install --frozen-lockfile
cp frontend/.env.example frontend/.env.local
```

Configura `NEXT_PUBLIC_BFF_URL` en `frontend/.env.local` con el origen del BFF del entorno local. Los comandos del workspace son:

```bash
pnpm --filter devfluency-frontend dev
pnpm --filter devfluency-frontend lint
pnpm --filter devfluency-frontend build
pnpm --filter devfluency-node-workspace test:frontend:phase0
```

No uses npm, npx, Yarn ni Bun para instalar, actualizar o ejecutar dependencias del proyecto. El CI y el despliegue verifican las dependencias exclusivamente con `pnpm install --frozen-lockfile`.
