# EduChat — image de production (Next.js 14, sortie "standalone").
#
# Base Debian slim plutôt qu'Alpine : la dépendance `bcrypt` est un module natif
# compilé, dont la chaîne de construction est nettement plus fiable sur glibc.

# ---- Étape 1 : dépendances ----------------------------------------------
FROM node:20-slim AS deps
WORKDIR /app

# Outils nécessaires si bcrypt doit être compilé depuis les sources
# (absents de l'image finale grâce au multi-étapes).
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# ---- Étape 2 : build ------------------------------------------------------
FROM node:20-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN yarn build

# ---- Étape 3 : image finale ----------------------------------------------
FROM node:20-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# Indispensable : sans cela le serveur standalone n'écoute que sur localhost,
# et Nginx Proxy Manager ne pourrait pas le joindre depuis un autre conteneur.
ENV HOSTNAME=0.0.0.0

RUN groupadd -g 1001 nodejs && useradd -u 1001 -g nodejs -m nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Données persistantes (base SQLite, verrous d'authentification) : monté en volume.
RUN mkdir -p /data && chown nextjs:nodejs /data

USER nextjs
EXPOSE 3000

# NOTE : après le premier build, vérifier que le déverrouillage par mot de passe
# fonctionne dans le conteneur — c'est le test qui prouve que le binaire natif de
# bcrypt a bien été embarqué par le traçage de dépendances de Next.js.
CMD ["node", "server.js"]
