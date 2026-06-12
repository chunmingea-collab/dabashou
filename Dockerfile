# 搭把手 · Docker 镜像
FROM node:20-alpine

WORKDIR /app

# 安装依赖
COPY server/package.json server/package-lock.json* ./server/
RUN cd server && npm install --production

# 复制源码
COPY . .

# 持久化数据目录
RUN mkdir -p /data

EXPOSE 3000

CMD ["node", "server/server.js"]
