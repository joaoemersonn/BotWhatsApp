# ==========================================
# Estágio 1: Build (TypeScript Compilation)
# ==========================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copia arquivos de definição de dependências
COPY package*.json tsconfig.json ./

# Instala todas as dependências (incluindo devDependencies para compilação)
RUN npm ci

# Copia código fonte
COPY src ./src

# Compila TypeScript para JavaScript (dist/)
RUN npm run build

# ==========================================
# Estágio 2: Produção (Imagem Otimizada)
# ==========================================
FROM node:22-alpine AS runner

WORKDIR /app

# Define ambiente de produção
ENV NODE_ENV=production

# Instala apenas dependências de produção para reduzir tamanho da imagem
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copia o código compilado do estágio builder
COPY --from=builder /app/dist ./dist

# Prepara o diretório de persistência de credenciais com permissão para o usuário node
RUN mkdir -p /app/auth_info_baileys && chown -R node:node /app

# Usa usuário não-root por segurança
USER node

# Volume montável para credenciais do WhatsApp
VOLUME ["/app/auth_info_baileys"]

# Expõe a porta da API HTTP
EXPOSE 3000

# Inicia o bot
CMD ["node", "dist/index.js"]
