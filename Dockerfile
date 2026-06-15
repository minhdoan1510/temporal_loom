# --- Stage 1: Build FE ---
FROM node:22-alpine AS fe-builder

WORKDIR /fe
COPY ui/web/package.json ui/web/pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY ui/web/ ./
RUN pnpm build

# --- Stage 2: Build Go ---
FROM harbor.zalopay.vn/docker/images/golang:1.25.10 AS go-builder

# TODO: Uncomment this when we have a private registry
# ENV GO111MODULE=on
# ENV GONOSUMDB="gitlab.zalopay.vn"
# ENV GONOPROXY="gitlab.zalopay.vn"
# ENV GOPRIVATE="gitlab.zalopay.vn"

WORKDIR /build
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o ./app .

# --- Stage 3: Build MCP Server ---
FROM harbor.zalopay.vn/docker/images/golang:1.25.10 AS mcp-builder

# TODO: Uncomment this when we have a private registry
# ENV GO111MODULE=on
# ENV GONOSUMDB="gitlab.zalopay.vn"
# ENV GONOPROXY="gitlab.zalopay.vn"
# ENV GOPRIVATE="gitlab.zalopay.vn"

WORKDIR /build
COPY mcp/go.mod mcp/go.sum ./
RUN go mod download
COPY ./mcp/ ./
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o ./mcp .

# --- Stage 4: Final ---
FROM harbor.zalopay.vn/docker/images/alpine:3.13

ENV TZ=Asia/Saigon

WORKDIR /apps

COPY --from=go-builder /build/app ./lending-claw
COPY --from=mcp-builder /build/mcp ./mcp
COPY --from=fe-builder /fe/dist ./web

EXPOSE 8080

ENTRYPOINT ["./lending-claw"]
CMD ["serve"]
