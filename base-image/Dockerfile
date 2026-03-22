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
