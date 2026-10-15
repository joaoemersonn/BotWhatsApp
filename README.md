# 🤖 WhatsApp Bot Auto-Hospedado (Baileys + Docker + API REST + Swagger + CI/CD)

Bot para WhatsApp 100% gratuito, sem taxas da Meta API e sem intermediários pagos. Conecta diretamente via protocolo WhatsApp Web (Multi-Device) utilizando a biblioteca [@whiskeysockets/baileys](https://github.com/WhiskeySockets/Baileys) e fornece uma **API HTTP REST documentada com Swagger** para envio ativo de mensagens, relatórios (texto, PDFs, planilhas, imagens) e consulta de grupos e contatos.

---

## 🚀 Principais Recursos (mais em breve)

- **100% Gratuito & Auto-Hospedado:** Sem cobrança por mensagem, sem serviços de terceiros.
- **📖 Swagger UI Integrado:** Documentação visual e interativa pronta no navegador em `/docs`.
- **👥 Gestão e Listagem de Grupos:** Endpoint para listar todos os grupos e capturar seus IDs (`@g.us`) para envio de relatórios.
- **📎 Envio de Relatórios & Mídias:** Disparo de PDFs, planilhas Excel, CSVs e imagens via URL ou Base64.
- **🔍 Verificação de Números:** Consulta de validade de telefone e resolução de JID canônico (evita erro do 9º dígito brasileiro).
- **Ultra Leve:** Consome ~50 a 100 MB de RAM (não utiliza navegadores pesados como Puppeteer/Chromium).
- **Docker Multi-Stage Otimizado:** Imagem Alpine pequena, segura (executa com usuário não-root) e pronta para produção.
- **Persistência de Sessão:** Volume mapeado (`auth_info_baileys`) para você não precisar escanear o QR Code a cada reinicialização ou atualização do container.
- **Anti-Ban Heuristics:** Simulação natural de digitação (`"digitando..."`) com delay configurável antes de cada resposta.
- **Pipeline CI/CD:** GitHub Actions configurado para checagem estática de tipos e publicação automática da imagem no GHCR.

---

## 📖 Documentação Interativa Swagger UI

Ao iniciar o bot, abra no seu navegador:

👉 **[http://localhost:3000/docs](http://localhost:3000/docs)** (ou `http://localhost:3000/`)

Você poderá visualizar todos os endpoints, parâmetros, schemas e **testar requisições diretamente pela interface gráfica**.

Para autenticar no Swagger:
1. Clique no botão verde **Authorize** no canto superior direito.
2. Digite sua chave de API (definida na variável `API_KEY` do seu `.env`).

---

## 📡 Endpoints da API HTTP

Todos os endpoints (exceto `/health` e `/docs`) aceitam autenticação via header:
- `x-api-key: seu_token_secreto_super_seguro_aqui` ou `Authorization: Bearer <API_KEY>`

### 1. Listar Grupos (Para obter os IDs de grupos)
Retorna todos os grupos em que o bot está inserido com o nome e o ID exato (`@g.us`).

- **Endpoint:** `GET /api/groups`
- **Exemplo com cURL:**
  ```bash
  curl -X GET http://localhost:3000/api/groups \
    -H "x-api-key: seu_token_secreto_super_seguro_aqui"
  ```
- **Resposta de Exemplo:**
  ```json
  {
    "success": true,
    "count": 2,
    "groups": [
      {
        "id": "120363028392819283@g.us",
        "subject": "Equipe de Vendas - Relatórios Diários",
        "owner": "5511999998888@s.whatsapp.net",
        "creation": "2026-08-10T14:20:00.000Z",
        "description": "Grupo para alertas diários de vendas",
        "participantsCount": 12,
        "announceOnly": false
      }
    ]
  }
  ```
> 💡 **Como usar:** Copie o campo `"id"` (ex: `120363028392819283@g.us`) e cole no campo `"to"` dos endpoints de envio para mandar relatórios direto para o grupo!

---

### 2. Enviar Mensagem de Texto (POST `/api/messages/send`)
Envia mensagens de texto formatadas com Markdown do WhatsApp (`*negrito*`, `_itálico_`, listas, etc.).

- **Endpoint:** `POST /api/messages/send` (ou `POST /api/send-message`)
- **Exemplo com cURL:**
  ```bash
  curl -X POST http://localhost:3000/api/messages/send \
    -H "Content-Type: application/json" \
    -H "x-api-key: seu_token_secreto_super_seguro_aqui" \
    -d '{
      "to": "120363028392819283@g.us",
      "message": "📊 *Relatório Diário de Operações*\n\n• Vendas: R$ 18.250,00\n• Pedidos: 54\n• Status: Meta batida! 🚀"
    }'
  ```

---

### 3. Enviar Relatório em PDF / Documento / Planilha (POST `/api/messages/send-media`)
Ideal para sistemas de relatórios que geram arquivos PDF, Excel (`.xlsx`), CSV ou imagens de dashboards.

- **Endpoint:** `POST /api/messages/send-media`
- **Payload via URL pública:**
  ```json
  {
    "to": "120363028392819283@g.us",
    "mediaUrl": "https://meuservidor.com/relatorios/diario_2026-10-14.pdf",
    "fileName": "relatorio_diario.pdf",
    "mimetype": "application/pdf",
    "caption": "Segue em anexo o relatório diário consolidado."
  }
  ```
- **Payload via Base64:**
  ```json
  {
    "to": "5511999998888",
    "mediaBase64": "JVBERi0xLjQKJ...",
    "fileName": "relatorio_vendas.xlsx",
    "mimetype": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "caption": "📊 Planilha consolidada de fechamento"
  }
  ```

---

### 4. Verificar se Número Existe no WhatsApp (POST `/api/contacts/check`)
Verifica a existência de um número e obtém o JID canônico oficial da Meta.

- **Endpoint:** `POST /api/contacts/check` (ou `GET /api/contacts/check/5511999998888`)
- **Body:** `{"phone": "5511999998888"}`
- **Resposta:**
  ```json
  {
    "success": true,
    "result": {
      "phone": "5511999998888",
      "cleanNumber": "5511999998888",
      "exists": true,
      "jid": "5511999998888@s.whatsapp.net"
    }
  }
  ```

---

### 5. Status & Healthcheck (GET `/api/status`)
- **Endpoint:** `GET /api/status` ou `GET /health`
- **Resposta:**
  ```json
  {
    "status": "online",
    "connected": true,
    "botName": "Meu Bot WhatsApp",
    "userJid": "5511999998888:1@s.whatsapp.net",
    "uptimeSeconds": 450
  }
  ```

---

## 🐍 Exemplo Completo em Python (Sistema de Relatórios)

```python
import requests

API_URL = "http://localhost:3000/api"
API_KEY = "seu_token_secreto_super_seguro_aqui"

headers = {
    "x-api-key": API_KEY,
    "Content-Type": "application/json"
}

# 1. Descobrir os grupos para pegar o ID correto
def obter_grupos():
    res = requests.get(f"{API_URL}/groups", headers=headers)
    for grupo in res.json().get("groups", []):
        print(f"Nome: {grupo['subject']} | ID: {grupo['id']}")

# 2. Enviar relatório em texto
def enviar_texto(destino: str, mensagem: str):
    payload = {"to": destino, "message": mensagem}
    res = requests.post(f"{API_URL}/messages/send", json=payload, headers=headers)
    return res.json()

# 3. Enviar relatório em PDF
def enviar_pdf(destino: str, url_pdf: str, nome_arquivo: str, legenda: str):
    payload = {
        "to": destino,
        "mediaUrl": url_pdf,
        "fileName": nome_arquivo,
        "mimetype": "application/pdf",
        "caption": legenda
    }
    res = requests.post(f"{API_URL}/messages/send-media", json=payload, headers=headers)
    return res.json()

# Exemplo de execução:
if __name__ == "__main__":
    # Descobre os IDs dos grupos
    obter_grupos()
    
    # Envia para um grupo específico
    ID_GRUPO = "120363028392819283@g.us"
    enviar_texto(ID_GRUPO, "🔔 *Aviso:* Relatório das 18h iniciando processamento...")
```

---

## ⚙️ Variáveis de Ambiente

Crie o arquivo `.env` baseado no `.env.example`:

| Variável | Padrão | Descrição |
| :--- | :--- | :--- |
| `NODE_ENV` | `development` | Ambiente (`development` ou `production`) |
| `BOT_NAME` | `Meu Bot WhatsApp` | Nome do bot |
| `BOT_PREFIX` | `!` | Prefixo de comandos interativos no chat |
| `PORT` | `3000` | Porta do servidor HTTP (API e Swagger) |
| `API_KEY` | *(opcional)* | Token secreto de autenticação para a API |
| `AUTH_DIR` | `./auth_info_baileys`| Diretório de credenciais da sessão (persistência) |
| `LOG_LEVEL` | `info` | Nível de log (`info`, `debug`, `warn`) |
| `AUTO_READ_MESSAGES`| `true` | Marca mensagens como lidas automaticamente |
| `IGNORE_GROUPS` | `false` | Se `true`, ignora comandos de chat enviados em grupos |
| `PAIRING_NUMBER` | *(vazio)* | Número com DDI/DDD para código de 8 dígitos |

---

## 💻 Executando Localmente

```bash
# 1. Instalar dependências
npm install

# 2. Iniciar em desenvolvimento
npm run dev

# 3. Escaneie o QR Code no terminal
# 4. Acesse http://localhost:3000/docs para testar os endpoints no Swagger!
```

---

## 🐳 Executando com Docker & Docker Compose

```bash
# Constrói e sobe o container
docker compose up -d --build

# Ver logs e QR Code
docker compose logs -f whatsapp-bot
```

> **Persistência de Sessão:** O volume `./auth_info_baileys` mapeado no container garante que ao reiniciar ou fazer deploy de novas versões, sua sessão de WhatsApp continue conectada sem precisar reler o QR Code.
