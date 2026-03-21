#!/bin/bash
set -e

# Claude Server — Production Deploy Script
# Usage: ./deploy.sh [setup|deploy|logs|status|stop]

COMPOSE_FILE="docker-compose.prod.yml"
ENV_FILE=".env.production"

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE not found. Copy .env.production and fill in your values."
  exit 1
fi

# Export env vars for docker compose
set -a
source "$ENV_FILE"
set +a

case "${1:-deploy}" in
  setup)
    echo "=== Setting up server ==="

    # Install Docker if not present
    if ! command -v docker &> /dev/null; then
      echo "Installing Docker..."
      curl -fsSL https://get.docker.com | sh
      sudo usermod -aG docker "$USER"
      echo "Docker installed. Log out and back in, then run this script again."
      exit 0
    fi

    # Create the shared network
    docker network create claude-server-network 2>/dev/null || true

    echo "Setup complete. Run './deploy.sh deploy' to start."
    ;;

  deploy)
    echo "=== Deploying Claude Server ==="

    # Create network if it doesn't exist
    docker network create claude-server-network 2>/dev/null || true

    # Build and start
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

    echo ""
    echo "=== Deployed! ==="
    echo "Dashboard: https://$DOMAIN"
    echo "Traefik:   https://traefik.$DOMAIN"
    echo ""
    echo "User apps will be at: https://{slug}.$DOMAIN"
    ;;

  logs)
    docker compose -f "$COMPOSE_FILE" logs -f "${2:-claude-server}"
    ;;

  status)
    docker compose -f "$COMPOSE_FILE" ps
    ;;

  stop)
    echo "Stopping Claude Server..."
    docker compose -f "$COMPOSE_FILE" down
    ;;

  restart)
    echo "Restarting Claude Server..."
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --build claude-server
    ;;

  update)
    echo "=== Updating Claude Server ==="
    git pull
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build claude-server
    docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d claude-server
    echo "Updated!"
    ;;

  *)
    echo "Usage: ./deploy.sh [setup|deploy|logs|status|stop|restart|update]"
    echo ""
    echo "  setup    — Install Docker and create network"
    echo "  deploy   — Build and start everything"
    echo "  logs     — Follow logs (optional: service name)"
    echo "  status   — Show running containers"
    echo "  stop     — Stop everything"
    echo "  restart  — Rebuild and restart the server"
    echo "  update   — Pull latest code and redeploy"
    ;;
esac
