# 🤖 WhatsApp Bot Auto-Hospedado (Baileys + Docker + CI/CD)

Bot para WhatsApp 100% gratuito, sem taxas da Meta API e sem intermediários pagos. Conecta diretamente via protocolo WhatsApp Web (Multi-Device) utilizando a biblioteca [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys).

---

## 🚀 Principais Recursos

- **100% Gratuito & Auto-Hospedado:** Sem cobrança por mensagem, sem serviços terceiros pagos.
- **Ultra Leve:** Consome ~50 a 100 MB de RAM (não utiliza navegadores pesados como Puppeteer/Chromium).
- **Docker Multi-Stage Otimizado:** Imagem Alpine pequena, segura (executa com usuário não-root) e pronta para produção.
- **Persistência de Sessão:** Volume mapeado (`auth_info_baileys`) para você não precisar escanear o QR Code a cada reinicialização ou atualização do container.
- **Duas Opções de Autenticação:**
  - **QR Code** renderizado diretamente no terminal.
  - **Código de Pareamento (Pairing Code)** de 8 dígitos para digitar no WhatsApp (ideal para servidores sem interface gráfica ou logs distorcidos).
- **Anti-Ban Heuristics:** Simulação natural de digitação (`"digitando..."`) com delay configurável antes de cada resposta.
- **Pipeline CI/CD:** GitHub Actions configurado para checagem estática de tipos e publicação automática da imagem no GitHub Container Registry (GHCR) ou Docker Hub.

---

## 📁 Estrutura do Projeto

```text
BotWhatsApp/
├── .github/
│   └── workflows/
│       └── ci-cd.yml          # Pipeline CI/CD (GitHub Actions)
├── src/
│   ├── config/
│   │   └── env.ts             # Validação e tipagem de variáveis de ambiente
│   ├── connection/
│   │   └── whatsapp.ts        # Gerenciador de conexão Baileys, QR Code e reconexão
│   ├── handlers/
│   │   ├── commands/          # Comandos modulares do bot
│   │   │   ├── help.ts        # Comando !ajuda
│   │   │   ├── ping.ts        # Comando !ping
│   │   │   ├── info.ts        # Comando !info
│   │   │   └── index.ts       # Registro central de comandos
│   │   ├── messageHandler.ts  # Pipeline de mensagens recebidas e anti-ban
│   │   └── types.ts           # Definições de tipos TypeScript
│   ├── utils/
│   │   └── logger.ts          # Logger estruturado (Pino / Pino-Pretty)
│   └── index.ts               # Ponto de entrada com graceful shutdown
├── auth_info_baileys/         # Credenciais da sessão (persistidas, fora do git)
├── .dockerignore
├── .env.example               # Modelo das variáveis de ambiente
├── .gitignore
├── Dockerfile                 # Multi-stage build para produção
├── docker-compose.yml         # Orquestração com mapeamento de volume
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
| `BOT_PREFIX` | `!` | Prefixo para disparar comandos (ex: `!ajuda`, `!ping`) |
| `AUTH_DIR` | `./auth_info_baileys` | Diretório onde a sessão multi-device é salva |
| `LOG_LEVEL` | `info` | Nível de log (`trace`, `debug`, `info`, `warn`, `error`) |
| `AUTO_READ_MESSAGES`| `true` | Se o bot deve marcar as mensagens como lidas automaticamente |
| `IGNORE_GROUPS` | `false` | Se `true`, ignora mensagens enviadas em grupos |
| `PAIRING_NUMBER` | *(vazio)* | Número com DDI e DDD para autenticar via código de 8 dígitos em vez de QR Code |

---

## 💻 Executando Localmente (Sem Docker)

Como você já possui o Node.js v24 instalado:

1. **Instale as dependências:**
   ```bash
   npm install
   ```

2. **Inicie em modo de desenvolvimento (com hot-reload):**
   ```bash
   npm run dev
   ```

3. **Escaneie o QR Code:**
   O QR Code aparecerá no terminal. Abra o WhatsApp no celular:
   > **Configurações / Aparelhos Conectados > Conectar um aparelho**.

4. **Para testar em modo de produção compilado:**
   ```bash
   npm run build
   npm start
   ```

---

## 🐳 Executando com Docker & Docker Compose

### 1. Iniciar com Docker Compose (Recomendado)

```bash
# Constrói a imagem e sobe o container em segundo plano
docker compose up -d --build

# Visualize os logs para ver o QR Code
docker compose logs -f whatsapp-bot
```

> **Dica:** O volume `./auth_info_baileys` garante que quando você reiniciar o container ou atualizar a imagem com novas versões do código, a sua sessão continuará conectada sem precisar escanear o QR Code de novo!

### 2. Parar o Bot

```bash
docker compose down
```

---

## 🔄 Fluxo de CI / CD (GitHub Actions)

O arquivo [`.github/workflows/ci-cd.yml`](.github/workflows/ci-cd.yml) está configurado com dois estágios:

1. **Typecheck & Build:** Roda em todos os Pull Requests e Pushes, garantindo que o código compila sem erros de tipos.
2. **Docker Build & Push:** Ao fazer push na branch `main`, constrói a imagem Docker multi-stage e publica no **GitHub Container Registry (GHCR)**:
   - Tag: `ghcr.io/<seu-usuario>/<seu-repo>:latest`
   - Tag: `ghcr.io/<seu-usuario>/<seu-repo>:<commit-sha>`

### Como fazer o deploy contínuo em sua VPS:
No seu servidor de produção, você pode simplesmente usar o `docker-compose.yml` apontando para a imagem do GHCR:

```yaml
services:
  whatsapp-bot:
    image: ghcr.io/seu-usuario/bot-whatsapp:latest
    container_name: whatsapp_bot
    restart: unless-stopped
    env_file: .env
    volumes:
      - ./auth_info_baileys:/app/auth_info_baileys
```

E para atualizar em produção:
```bash
docker compose pull && docker compose up -d
```

---

## ➕ Como Adicionar Novos Comandos

Para criar um novo comando, crie um arquivo em `src/handlers/commands/exemplo.ts`:

```typescript
import { Command } from '../types.js';

export const meuComando: Command = {
  name: 'promocao',
  description: 'Envia as promoções ativas do dia',
  aliases: ['promo', 'ofertas'],
  execute: async ({ reply, args }) => {
    await reply('🔥 *Promoção de hoje:* 20% de desconto!');
  },
};
```

E registre-o em [`src/handlers/commands/index.ts`](src/handlers/commands/index.ts):

```typescript
import { meuComando } from './exemplo.js';

register(meuComando);
```

---

## 🛡️ Dicas de Segurança e Boas Práticas (Anti-Ban)

1. **Número Dedicado:** Durante desenvolvimento e testes de novos fluxos, utilize sempre um chip/número secundário.
2. **Evite Spam:** Nunca envie mensagens em massa para números que não iniciaram uma conversa prévia com você.
3. **Mantenha os Delays:** A função `simulateTyping` nativa no projeto simula comportamento humano antes de enviar respostas.
