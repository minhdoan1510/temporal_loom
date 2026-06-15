FROM golang:1.24-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -o /out/mcp-server ./cmd/server

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
WORKDIR /app
COPY --from=build /out/mcp-server /app/mcp-server
EXPOSE 7080
ENTRYPOINT ["/app/mcp-server"]
CMD ["--config", "/etc/mcp/config.yaml"]
