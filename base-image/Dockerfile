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

# OpenSSL 1.1 compat for Prisma engine binaries
RUN apk add --no-cache openssl1-compat || true

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
