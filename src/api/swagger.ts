import swaggerUi from 'swagger-ui-express';
import { Router } from 'express';
import { config } from '../config/env.js';

export const swaggerSpec = {
  openapi: '3.0.0',
  info: {
    title: '🤖 WhatsApp Bot',
    version: '1.0.0',
    description: `API HTTP para disparo ativo de mensagens, envio de relatórios e consulta de grupos e contatos via WhatsApp Web (Baileys).

### 🔑 Autenticação
Se configurada a variável \`API_KEY\` no \`.env\`, passe o token através do header:
- **x-api-key:** \`seu_token_aqui\`
- Ou **Authorization:** \`Bearer seu_token_aqui\`
`,
  },
  servers: [
    {
      url: '/',
      description: 'Servidor Atual (Dinâmico)',
    },
  ],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'x-api-key',
        description: 'Chave de API configurada na variável API_KEY',
      },
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'Token Bearer configurado na variável API_KEY',
      },
    },
    schemas: {
      ErrorResponse: {
        type: 'object',
        properties: {
          success: { type: 'boolean', example: false },
          error: { type: 'string', example: 'Descrição detalhada do erro' },
        },
      },
      SendTextRequest: {
        type: 'object',
        required: ['to', 'message'],
        properties: {
          to: {
            type: 'string',
            description: 'Número com DDI/DDD (ex: 5511999998888) ou ID do grupo (ex: 120363028392819283@g.us)',
            example: '5511999998888',
          },
          message: {
            type: 'string',
            description: 'Texto da mensagem (suporta formatação Markdown do WhatsApp: *negrito*, _itálico_, etc.)',
            example: '📊 *Relatório Diário:* Todas as metas foram atingidas!',
          },
        },
      },
      SendMediaRequest: {
        type: 'object',
        required: ['to'],
        properties: {
          to: {
            type: 'string',
            description: 'Número do destinatário ou ID do grupo',
            example: '120363028392819283@g.us',
          },
          mediaUrl: {
            type: 'string',
            description: 'URL pública acessível da mídia/documento a ser baixado e enviado',
            example: 'https://exemplo.com/relatorio.pdf',
          },
          mediaBase64: {
            type: 'string',
            description: 'Conteúdo do arquivo codificado em Base64 (alternativa a mediaUrl)',
            example: 'JVBERi0xLjQKJ...',
          },
          fileName: {
            type: 'string',
            description: 'Nome do arquivo que aparecerá no WhatsApp (ex: relatorio.pdf)',
            example: 'relatorio_diario.pdf',
          },
          mimetype: {
            type: 'string',
            description: 'Tipo MIME do arquivo (ex: application/pdf, image/png, text/csv)',
            example: 'application/pdf',
          },
          caption: {
            type: 'string',
            description: 'Legenda opcional acompanhando o documento ou imagem',
            example: 'Segue em anexo o relatório em PDF.',
          },
        },
      },
      CheckContactRequest: {
        type: 'object',
        required: ['phone'],
        properties: {
          phone: {
            type: 'string',
            description: 'Número de telefone a verificar (com DDI e DDD)',
            example: '5511999998888',
          },
        },
      },
    },
  },
  security: [
    { ApiKeyAuth: [] },
    { BearerAuth: [] },
  ],
  paths: {
    '/api/status': {
      get: {
        summary: 'Verificar status do bot e conexão do WhatsApp',
        tags: ['Status & Saúde'],
        responses: {
          '200': {
            description: 'Bot online e conectado ao WhatsApp',
          },
          '503': {
            description: 'Bot offline ou desconectado',
          },
        },
      },
    },
    '/api/messages/send': {
      post: {
        summary: 'Enviar mensagem de texto ativa para um contato ou grupo',
        tags: ['Mensagens'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SendTextRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Mensagem enviada com sucesso',
          },
          '400': {
            description: 'Parâmetros inválidos (to ou message ausentes)',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
          '503': {
            description: 'WhatsApp desconectado',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
        },
      },
    },
    '/api/messages/send-media': {
      post: {
        summary: 'Enviar documento, PDF, imagem ou planilha',
        tags: ['Mensagens'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SendMediaRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Arquivo de mídia enviado com sucesso',
          },
          '400': {
            description: 'Dados da mídia ausentes ou inválidos',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } } },
          },
          '503': {
            description: 'WhatsApp desconectado',
          },
        },
      },
    },
    '/api/groups': {
      get: {
        summary: 'Listar todos os grupos dos quais o bot participa (com seus IDs)',
        tags: ['Grupos'],
        description: 'Retorna a lista completa de grupos onde o bot está presente. Utilize este endpoint para descobrir o ID do grupo (terminado em @g.us) para onde deseja enviar relatórios.',
        responses: {
          '200': {
            description: 'Lista de grupos retornada com sucesso',
          },
          '503': {
            description: 'WhatsApp não conectado',
          },
        },
      },
    },
    '/api/groups/{id}': {
      get: {
        summary: 'Obter detalhes e participantes de um grupo específico',
        tags: ['Grupos'],
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'ID do grupo (ex: 120363028392819283@g.us)',
            schema: { type: 'string' },
            example: '120363028392819283@g.us',
          },
        ],
        responses: {
          '200': {
            description: 'Detalhes do grupo retornados com sucesso',
          },
          '404': {
            description: 'Grupo não encontrado',
          },
        },
      },
    },
    '/api/contacts/check': {
      post: {
        summary: 'Verificar se um número existe no WhatsApp e obter JID canônico',
        tags: ['Contatos'],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CheckContactRequest' },
            },
          },
        },
        responses: {
          '200': {
            description: 'Resultado da verificação do número',
          },
        },
      },
    },
    '/api/contacts/check/{phone}': {
      get: {
        summary: 'Verificar número via URL (GET)',
        tags: ['Contatos'],
        parameters: [
          {
            name: 'phone',
            in: 'path',
            required: true,
            description: 'Número de telefone a verificar',
            schema: { type: 'string' },
            example: '5511999998888',
          },
        ],
        responses: {
          '200': {
            description: 'Resultado da verificação do número',
          },
        },
      },
    },
  },
};

export const swaggerRouter = Router();

// Configuração do Swagger UI
swaggerRouter.use(
  '/',
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'WhatsApp Bot API Docs',
    customCss: '.swagger-ui .topbar { display: none }',
  })
);
