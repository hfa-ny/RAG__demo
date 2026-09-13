FROM node:22-slim AS build

WORKDIR /app/ts_demo

COPY ts_demo/package.json ts_demo/package-lock.json ./
RUN npm ci

COPY ts_demo/ ./
RUN npm run build

FROM node:22-slim

ENV NODE_ENV=production

WORKDIR /app/ts_demo

COPY ts_demo/package.json ts_demo/package-lock.json ./
RUN npm ci --omit=dev

COPY --from=build /app/ts_demo/dist ./dist
COPY demo_docs/ /app/demo_docs/

EXPOSE 8502

CMD ["node", "dist/server/index.js"]
