FROM node:20-alpine

WORKDIR /app

# Pre-install common npm packages so project builds only install extras
RUN npm init -y && \
    npm install \
      express \
      cors \
      pg \
      bcryptjs \
      jsonwebtoken \
      uuid \
      dotenv \
      multer \
      cookie-parser \
      compression \
      morgan \
      helmet \
      express-rate-limit \
      ws \
      socket.io \
      axios \
      node-fetch \
      dayjs \
      marked \
      sanitize-html \
      sharp \
    && rm -rf /root/.npm /tmp/*

# Keep node_modules in a shared layer — project builds copy on top
ENV NODE_PATH=/app/node_modules
ENV PATH=/app/node_modules/.bin:$PATH

# OpenSSL compat for Prisma engine binaries
# Prisma v5 looks for libssl.so.1.1 but Alpine 3.20+ only has OpenSSL 3.
# Symlink so Prisma finds it. This works because the ABI is forward-compatible for loading.
RUN apk add --no-cache openssl && \
    ln -sf /usr/lib/libssl.so.3 /usr/lib/libssl.so.1.1 && \
    ln -sf /usr/lib/libcrypto.so.3 /usr/lib/libcrypto.so.1.1

# Python runtime + common packages
RUN apk add --no-cache python3 py3-pip build-base && \
    python3 -m pip install --break-system-packages \
      flask \
      fastapi \
      "uvicorn[standard]" \
      gunicorn \
      psycopg2-binary \
      python-dotenv \
      requests \
      httpx \
      sqlalchemy \
      pydantic \
      jinja2 \
      flask-login \
      flask-cors \
      flask-sqlalchemy \
      flask-wtf \
      bcrypt \
    && rm -rf /root/.cache/pip

ENV PYTHONUNBUFFERED=1
