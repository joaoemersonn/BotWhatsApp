#!/usr/bin/env bash
# =========================================================================
# Script de Auto-Deploy Genérico para Múltiplos Projetos
#
# Como usar:
#   1. Coloque este script dentro da sua pasta pai (ex: ~/projetos ou /DATA/AppData)
#   2. Dê permissão de execução: chmod +x auto-update-all.sh
#   3. Adicione UMA ÚNICA LINHA no crontab:
#      * * * * * /caminho/projetos/auto-update-all.sh >> /var/log/auto-update-projetos.log 2>&1
# =========================================================================

# Garante comandos essenciais no PATH do cron
export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:$PATH"

# Define a pasta raiz onde estão os projetos
# Se passado como argumento ($1), usa o argumento. Senão, usa a pasta onde o script está localizado.
PROJECTS_ROOT="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)}"

# Evita que duas instâncias do script rodem juntas (trava de concorrência com flock)
LOCK_FILE="/tmp/auto_update_all_projects.lock"
exec 200>"$LOCK_FILE"
flock -n 200 || {
    # Se já houver um build rodando, apenas encerra silenciosamente
    exit 0
}

updated_any=0

# Itera sobre todas as subpastas da pasta de projetos
for dir in "$PROJECTS_ROOT"/*/; do
    # Verifica se é um diretório válido
    [ -d "$dir" ] || continue

    # Verifica se é um repositório Git
    [ -d "$dir/.git" ] || continue

    project_name=$(basename "$dir")

    # Executa a verificação dentro de uma subshell isolada
    (
        cd "$dir" || exit 1

        # Identifica dinamicamente a branch atual (main, master, develop, etc.)
        current_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
        [ -z "$current_branch" ] && exit 0

        # Atualiza informações remotas da branch atual
        git fetch origin "$current_branch" --quiet 2>/dev/null || exit 0

        # Compara hashes do commit local vs remoto
        local_hash=$(git rev-parse HEAD 2>/dev/null)
        remote_hash=$(git rev-parse "origin/$current_branch" 2>/dev/null)

        # Se houver novos commits na branch
        if [ -n "$local_hash" ] && [ -n "$remote_hash" ] && [ "$local_hash" != "$remote_hash" ]; then
            echo "----------------------------------------------------------------------"
            echo "[$(date '+%Y-%m-%d %H:%M:%S')] 🚀 [${project_name}] Novos commits encontrados na branch '${current_branch}'!"

            # Puxa as alterações mais recentes
            git pull origin "$current_branch"

            # Procura por arquivo docker compose no projeto
            compose_file=""
            for candidate in docker-compose.yml docker-compose.yaml compose.yml compose.yaml; do
                if [ -f "$candidate" ]; then
                    compose_file="$candidate"
                    break
                fi
            done

            # Se tiver Docker Compose, recompila e reinicia
            if [ -n "$compose_file" ]; then
                echo "[$(date '+%Y-%m-%d %H:%M:%S')] 🐳 [${project_name}] Reconstruindo containers (${compose_file})..."
                docker compose up -d --build
            fi

            echo "[$(date '+%Y-%m-%d %H:%M:%S')] ✅ [${project_name}] Atualizado com sucesso!"
            exit 2 # Código de retorno 2 indica que houve atualização
        fi

        exit 0
    )

    exit_code=$?
    if [ "$exit_code" -eq 2 ]; then
        updated_any=1
    fi
done

# Se algum projeto foi atualizado, faz limpeza de imagens antigas/órfãs
if [ "$updated_any" -eq 1 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] 🧹 Removendo imagens Docker antigas para liberar disco..."
    docker image prune -f --quiet
fi
