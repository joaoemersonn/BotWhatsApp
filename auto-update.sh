#!/bin/bash
# ========================================================
# Script de Auto-Deploy para Ubuntu Server / CasaOS
# Verifica commits novos na branch ativa e recompila o bot
# ========================================================

# Garante comandos essenciais no PATH do cron
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"

# Diretório onde o repositório está clonado no servidor (resolução absoluta)
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$PROJECT_DIR" || exit 1

# Evita erro do Git de "dubious ownership" no Linux quando executado pelo cron
git config --global --add safe.directory "$PROJECT_DIR" 2>/dev/null

# Detecta a branch ativa (main ou master)
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "main")

# Atualiza informações remotas da branch
git fetch origin "$BRANCH" --quiet

# Compara o commit local com o commit remoto
LOCAL_COMMIT=$(git rev-parse HEAD 2>/dev/null)
REMOTE_COMMIT=$(git rev-parse "origin/$BRANCH" 2>/dev/null)

if [ -n "$LOCAL_COMMIT" ] && [ -n "$REMOTE_COMMIT" ] && [ "$LOCAL_COMMIT" != "$REMOTE_COMMIT" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 🚀 Novo commit detectado na branch '${BRANCH}'! Atualizando..."
    
    # Baixa o novo código
    git pull origin "$BRANCH"
    
    # Reconstrói a imagem Docker e força a recriação do container com o novo código
    docker compose up -d --build --force-recreate
    
    # Limpa imagens antigas para economizar disco
    docker image prune -f --quiet
    
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ Aplicação atualizada e recriada com sucesso!"
fi
