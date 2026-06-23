FROM node:20-alpine

WORKDIR /app

COPY server/package.json ./
RUN npm install --production

COPY . .

RUN mkdir -p /data

ENV DB_PATH=/data/data.db

EXPOSE 3000

CMD ["node", "server/server.js"]
