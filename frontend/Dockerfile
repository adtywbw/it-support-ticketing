FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig*.json ./
COPY vite.config.* ./
COPY postcss.config.js ./
COPY tailwind.config.js ./
COPY index.html ./
COPY src ./src

RUN npm run build

FROM nginx:1.25-alpine AS production

COPY nginx.conf /etc/nginx/nginx.conf

COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
