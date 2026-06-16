# Standalone MCP server image (deployed to its own AgentBase runtime).
#
# Build context is the REPO ROOT (not ./mcp) so we can pull in config/ and
# deploy/agentbase/ alongside the mcp/ module. Build with:
#   docker build -f mcp/Dockerfile -t lending-claw-mcp .
FROM golang:1.25-alpine AS build
WORKDIR /src
COPY mcp/go.mod mcp/go.sum ./
RUN go mod download
COPY mcp/ ./
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /out/mcp-server .

FROM alpine:3.20
RUN apk add --no-cache ca-certificates gettext
WORKDIR /app
COPY --from=build /out/mcp-server /app/mcp-server
COPY config/config.mcp.yaml.tmpl /etc/mcp/config.mcp.yaml.tmpl
COPY deploy/agentbase/mcp-entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh
EXPOSE 8080
ENTRYPOINT ["/app/entrypoint.sh"]
