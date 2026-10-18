# SLC University Clinic System: production image.
# Build:  docker build -t slc-clinic .
FROM node:22-alpine AS deps
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

FROM node:22-alpine
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000
WORKDIR /app
COPY --from=deps /app/backend/node_modules ./backend/node_modules
COPY backend ./backend
COPY frontend ./frontend
RUN rm -rf backend/tests backend/.env backend/.env.test frontend/tests frontend/archive \
 && chown -R node:node /app
USER node
WORKDIR /app/backend
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/readyz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Apply pending migrations, then start. Safe to repeat on every deploy.
CMD ["sh", "-c", "node db/migrate.js && exec node server.js"]
