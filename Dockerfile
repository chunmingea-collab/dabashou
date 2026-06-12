# 搭把手 · Docker 镜像
FROM node:20-alpine

WORKDIR /app

# 安装 better-sqlite3 编译所需的构建依赖
RUN apk add --no-cache python3 make g++ sqlite-dev

# 安装 Node 依赖
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm install --production

# 移除构建依赖，减小镜像体积
RUN apk del python3 make g++ sqlite-dev

# 精准复制源码（不复制 .git / .claude / .github 等）
COPY server/ ./server/
COPY index.html app.js style.css ./

# 持久化数据目录
RUN mkdir -p /data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

CMD ["node", "server/server.js"]
