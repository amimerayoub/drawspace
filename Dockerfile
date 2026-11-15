FROM node:20-slim

WORKDIR /app

# Install dependencies with dev deps included so the TypeScript compiler is available.
COPY package.json package-lock.json ./
COPY server/package.json ./server/package.json
RUN npm ci --include=dev

# Compile the server (self-contained under server/src) into server/dist.
# Tests are excluded from the production build; some import frontend code.
COPY server/tsconfig.json server/tsconfig.build.json ./server/
COPY server/src ./server/src
RUN npm run server:build

ENV NODE_ENV=production
EXPOSE 3001

CMD ["npm", "start"]