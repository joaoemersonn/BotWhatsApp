#!/bin/bash
# ========================================================
# Script de Auto-Deploy para Ubuntu Server / CasaOS
# Verifica commits novos na branch master e recompila o bot
# ========================================================

# Diretório onde o repositório está clonado no servidor
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR" || exit 1

# Atualiza informações remotas do git
git fetch origin master --quiet

# Compara o commit local com o commit remoto
LOCAL_COMMIT=$(git rev-parse HEAD)
REMOTE_COMMIT=$(git rev-parse origin/master)

if [ "$LOCAL_COMMIT" != "$REMOTE_COMMIT" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 🚀 Novo commit detectado no GitHub! Atualizando..."
    
    # Baixa o novo código
    git pull origin master
    
    # Reconstrói a imagem Docker e reinicia o container
    docker compose up -d --build
    
    # Limpa imagens antigas para economizar disco
    docker image prune -f
    
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ Aplicação atualizada e rodando com sucesso!"
fi
