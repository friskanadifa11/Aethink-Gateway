FROM node:22.16.0-alpine
ENV NODE_ENV=production HOST=0.0.0.0 PORT=8787 DATABASE_PATH=/data/aethinkai.db
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
COPY scripts ./scripts
RUN mkdir -p /data && chown -R node:node /app /data
USER node
EXPOSE 8787
CMD ["node", "src/server.js"]
