# ============================================================
# يجيب — صورة Docker واحدة تعمل على كل المنصات
#   docker compose up -d        (الأسهل)
# أو:
#   docker build -t yijeeb .
#   docker run -d -p 3000:3000 -v yijeeb-data:/data --name yijeeb yijeeb
# ============================================================
FROM node:22-alpine

ENV NODE_ENV=production

WORKDIR /opt/yijeeb

# الاعتماديات أولًا (طبقة تُخزَّن مؤقتًا)
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev --no-audit --no-fund && npm cache clean --force

# الكود + العميل
COPY app ./app
COPY server ./server
COPY scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh
RUN chmod +x scripts/docker-entrypoint.sh

# مجلد البيانات الدائم
RUN mkdir -p /data && chown -R node:node /data /opt/yijeeb
USER node
ENV DATA_DIR=/data

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health >/dev/null 2>&1 || exit 1

CMD ["sh", "scripts/docker-entrypoint.sh"]
