# 🤖 WhatsApp Bot Auto-Hospedado (Baileys + Docker + API HTTP + CI/CD)

Bot para WhatsApp 100% gratuito, sem taxas da Meta API e sem intermediários pagos. Conecta diretamente via protocolo WhatsApp Web (Multi-Device) utilizando a biblioteca [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys) e fornece uma **API HTTP REST** para disparo ativo de mensagens (ideal para sistemas de relatórios, alertas e automações externas).

---

## 🚀 Principais Recursos

- **100% Gratuito & Auto-Hospedado:** Sem cobrança por mensagem, sem serviços de terceiros.
- **📡 API HTTP Integrada (Disparo Ativo):** Endpoints REST para seu sistema externo ou cron job enviar relatórios para contatos ou grupos.
- **Ultra Leve:** Consome ~50 a 100 MB de RAM (não utiliza navegadores pesados como Puppeteer/Chromium).
- **Docker Multi-Stage Otimizado:** Imagem Alpine pequena, segura (executa com usuário não-root) e pronta para produção.
- **Persistência de Sessão:** Volume mapeado (`auth_info_baileys`) para você não precisar escanear o QR Code a cada reinicialização ou atualização do container.
- **Duas Opções de Autenticação WhatsApp:**
  - **QR Code** renderizado diretamente no terminal.
  - **Código de Pareamento (Pairing Code)** de 8 dígitos para digitar no WhatsApp (ideal para servidores sem interface gráfica ou logs distorcidos).
- **Anti-Ban Heuristics:** Simulação natural de digitação (`"digitando..."`) com delay configurável antes de cada resposta.
- **Pipeline CI/CD:** GitHub Actions configurado para checagem estática de tipos e publicação automática da imagem no GitHub Container Registry (GHCR) ou Docker Hub.

---

## 📡 API HTTP: Envio Ativo de Mensagens e Relatórios

O bot inclui um servidor HTTP interno (Express) com suporte a autenticação por `API_KEY`.

### 1. Enviar Mensagem (POST `/api/messages/send`)
Envia uma mensagem de texto para um contato individual ou para um grupo.

- **URL:** `http://localhost:3000/api/messages/send` (ou `POST /api/send-message`)
- **Headers:**
  - `Content-Type: application/json`
  - `x-api-key: seu_token_secreto_super_seguro_aqui` (ou `Authorization: Bearer <API_KEY>`)
- **Body:**
  ```json
  {
    "to": "5511999998888",
    "message": "📊 *Relatório Diário de Vendas*\n\n• Vendas: R$ 15.420,00\n• Pedidos: 42\n• Status: Meta batida! 🚀"
  }
  ```

> **Dica para o campo `to`:**
> - Você pode informar apenas o número com DDI e DDD (ex: `5511999998888`). O bot valida e resolve automaticamente o JID canônico no WhatsApp.
> - Para enviar para um **grupo**, basta informar o ID do grupo (ex: `120363028392819283@g.us`).

#### Exemplo em cURL:
```bash
curl -X POST http://localhost:3000/api/messages/send \
  -H "Content-Type: application/json" \
  -H "x-api-key: seu_token_secreto_super_seguro_aqui" \
  -d '{
    "to": "5511999998888",
    "message": "📊 *Relatório Diário:* Todas as tarefas foram concluídas com sucesso!"
  }'
```

#### Exemplo em Python (para scripts de relatórios):
```python
import requests

def enviar_relatorio(telefone: str, texto: str):
    url = "http://localhost:3000/api/messages/send"
    headers = {
        "x-api-key": "seu_token_secreto_super_seguro_aqui",
        "Content-Type": "application/json"
    }
    payload = {
        "to": telefone,
        "message": texto
    }
    response = requests.post(url, json=payload, headers=headers)
    return response.json()

# Exemplo de chamada:
enviar_relatorio("5511999998888", "📈 Relatório gerado às 18:00 com sucesso!")
```

### 2. Status e Healthcheck (GET `/api/status`)
- **URL:** `http://localhost:3000/api/status` (ou `GET /health`)
- **Resposta:**
  ```json
  {
    "status": "online",
    "connected": true,
    "botName": "Meu Bot WhatsApp",
    "environment": "development",
    "userJid": "5511999998888:1@s.whatsapp.net",
    "uptimeSeconds": 360,
    "timestamp": "2026-10-14T21:40:00.000Z"
  }
  ```

---

## 📁 Estrutura do Projeto

```text
BotWhatsApp/
├── .github/
│   └── workflows/
│       └── ci-cd.yml          # Pipeline CI/CD (GitHub Actions)
├── src/
│   ├── api/                   # Servidor HTTP para disparos ativos
│   │   ├── auth.ts            # Middleware de autenticação por API Key
│   │   ├── routes.ts          # Rotas REST (/api/messages/send, /api/status)
│   │   └── server.ts          # Inicialização e encerramento do Express
│   ├── config/
│   │   └── env.ts             # Validação e tipagem de variáveis de ambiente
│   ├── connection/
│   │   └── whatsapp.ts        # Conexão Baileys, envio ativo, QR Code e reconexão
│   ├── handlers/
│   │   ├── commands/          # Comandos interativos (!ajuda, !ping, !info)
│   │   ├── messageHandler.ts  # Tratamento de mensagens recebidas e anti-ban
│   │   └── types.ts           # Definições de tipos TypeScript
│   ├── utils/
│   │   └── logger.ts          # Logger estruturado (Pino / Pino-Pretty)
│   └── index.ts               # Ponto de entrada com graceful shutdown
├── auth_info_baileys/         # Credenciais da sessão (persistidas no volume, fora do git)
├── .dockerignore
├── .env.example               # Modelo das variáveis de ambiente
├── .gitignore
├── Dockerfile                 # Multi-stage build para produção
├── docker-compose.yml         # Orquestração com mapeamento de volume e porta 3000
├── package.json
└── tsconfig.json
```

---

## ⚙️ Variáveis de Ambiente

Crie o arquivo `.env` na raiz do projeto baseado no `.env.example`:

```bash
cp .env.example .env
```

| Variável | Padrão | Descrição |
| :--- | :--- | :--- |
| `NODE_ENV` | `development` | Ambiente (`development` ou `production`) |
| `BOT_NAME` | `Meu Bot WhatsApp` | Nome de exibição do bot |
| `BOT_PREFIX` | `!` | Prefixo para disparar comandos interativos (ex: `!ajuda`, `!ping`) |
| `PORT` | `3000` | Porta onde o servidor HTTP da API escuta requisições |
| `API_KEY` | *(opcional)* | Token secreto de autenticação para a API HTTP |
| `AUTH_DIR` | `./auth_info_baileys`| Diretório onde a sessão multi-device é salva |
| `LOG_LEVEL` | `info` | Nível de log (`trace`, `debug`, `info`, `warn`, `error`) |
| `AUTO_READ_MESSAGES`| `true` | Se o bot deve marcar mensagens recebidas como lidas |
| `IGNORE_GROUPS` | `false` | Se `true`, ignora comandos recebidos em grupos |
| `PAIRING_NUMBER` | *(vazio)* | Número para conectar via código de 8 dígitos em vez de QR Code |

---

## 💻 Executando Localmente (Sem Docker)

1. **Instale as dependências:**
   ```bash
   npm install
   ```

2. **Inicie em modo de desenvolvimento:**
   ```bash
   npm run dev
   ```

3. **Escaneie o QR Code:**
   O QR Code aparecerá no terminal. Abra o WhatsApp no celular:
   > **Configurações / Aparelhos Conectados > Conectar um aparelho**.

4. **Para testar a compilação de produção:**
   ```bash
   npm run build
   npm start
   ```

---

## 🐳 Executando com Docker & Docker Compose

### 1. Iniciar com Docker Compose (Recomendado)

```bash
# Constrói a imagem e sobe o container mapeando a porta 3000 e o volume de sessão
docker compose up -d --build

# Visualize os logs para ver o QR Code
docker compose logs -f whatsapp-bot
```

> **Persistência de Sessão:** O volume `./auth_info_baileys` garante que ao reiniciar ou atualizar o container, a sua conexão do WhatsApp continue salva sem precisar escanear novamente.

### 2. Parar o Bot

```bash
docker compose down
```

---

## 🔄 Fluxo de CI / CD (GitHub Actions)

O arquivo [`.github/workflows/ci-cd.yml`](.github/workflows/ci-cd.yml) possui dois estágios automatizados:

1. **Typecheck & Build:** Valida os tipos TypeScript e testa a compilação a cada PR e push.
2. **Docker Build & Push:** Ao fazer push na branch `main`, compila a imagem Docker multi-stage e publica no **GitHub Container Registry (GHCR)**.

### Deploy na VPS:
Na sua VPS ou servidor de relatórios, basta rodar:
```bash
docker compose pull && docker compose up -d
```

---

## 🛡️ Dicas Anti-Ban para Relatórios

1. **Intervalos entre disparos:** Se o seu sistema de relatório for disparar para múltiplos contatos em lote, adicione um `sleep(3)` a `sleep(5)` segundos entre cada requisição.
2. **Mensagens informativas:** Dispare para contatos que já conversam com a empresa ou que autorizaram receber alertas (números de funcionários, sócios, clientes ativos).
