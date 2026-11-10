# Stage 1: compile OpenLifter's Create React App bundle
FROM node:20-bookworm-slim AS build
WORKDIR /app
RUN corepack enable && corepack prepare yarn@1.22.22 --activate
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --non-interactive
# CRA 5's fork-ts-checker is incompatible with the fork's TypeScript 5.x.
# Pin the compiler to the last supported TypeScript 4.9 release for this build.
RUN yarn add --dev --exact typescript@4.9.5 --non-interactive
COPY . .
# Windows Git checkouts can use CRLF. Normalize source files inside Linux
# before ESLint/Prettier runs; no application logic is modified.
RUN find src -type f \( -name '*.ts' -o -name '*.tsx' -o -name '*.js' -o -name '*.jsx' \) -exec sed -i 's/\r$//' {} +
RUN ./node_modules/.bin/prettier --write src/components/CloudSync.tsx src/App.tsx
RUN yarn build

# Stage 2: serve the generated single-page application
FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/build/ /usr/share/nginx/html/
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -q -O /dev/null http://127.0.0.1/ || exit 1
