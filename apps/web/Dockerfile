FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
ENV AUTH0_DOMAIN=build.invalid
ENV AUTH0_CLIENT_ID=build-only
ENV AUTH0_CLIENT_SECRET=build-only
ENV AUTH0_SECRET=0000000000000000000000000000000000000000000000000000000000000000
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
RUN addgroup -S platform && adduser -S platform -G platform
COPY --from=build --chown=platform:platform /app/public ./public
COPY --from=build --chown=platform:platform /app/.next/standalone ./
COPY --from=build --chown=platform:platform /app/.next/static ./.next/static
USER platform
EXPOSE 3000
CMD ["node", "server.js"]
