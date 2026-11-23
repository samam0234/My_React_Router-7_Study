# 1단계: 개발 의존성까지 설치하고 빌드한다.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# 2단계: 운영 의존성만 설치한다.
FROM node:24-alpine AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 3단계: 실행 이미지. 빌드 결과와 운영 의존성만 담고 root가 아닌 사용자로 실행한다.
FROM node:24-alpine
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY package.json ./
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
RUN mkdir -p /app/data && chown -R node:node /app/data
USER node
EXPOSE 3000
VOLUME ["/app/data"]
HEALTHCHECK --interval=15s --timeout=3s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "start"]
