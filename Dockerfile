# --- Stage 1: Build the React Frontend ---
FROM node:22-alpine AS frontend-builder
WORKDIR /app/web
COPY web/package*.json ./
RUN npm install
COPY web/ ./
ARG VITE_GA_MEASUREMENT_ID
ENV VITE_GA_MEASUREMENT_ID=$VITE_GA_MEASUREMENT_ID
RUN npm run lint
RUN npm test
RUN npm run build

# --- Stage 2: Build the Go Backend ---
FROM golang:1.27-alpine AS backend-builder
COPY --from=golangci/golangci-lint:v2.15-alpine /usr/bin/golangci-lint /usr/local/bin/golangci-lint
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# Copy the compiled React assets from the first stage
COPY --from=frontend-builder /app/web/dist ./web/dist
RUN unformatted="$(gofmt -l main.go api db scraper thumbs cmd)" && if [ -n "$unformatted" ]; then echo "gofmt needed on: $unformatted" >&2; exit 1; fi
RUN CGO_ENABLED=0 go vet . ./api/... ./db/... ./scraper/... ./thumbs/... ./cmd/...
RUN CGO_ENABLED=0 golangci-lint run . ./api/... ./db/... ./scraper/... ./thumbs/... ./cmd/...
RUN CGO_ENABLED=0 go test -count=1 . ./api/... ./db/... ./scraper/... ./thumbs/... ./cmd/...
RUN CGO_ENABLED=0 GOOS=linux go build -o main .

# --- Stage 3: Final Production Image ---
FROM alpine:latest
WORKDIR /app
# Install CA certificates (required for secure HTTPS database connections)
RUN apk --no-cache add ca-certificates
COPY --from=backend-builder /app/main .
COPY --from=backend-builder /app/web/dist ./web/dist

EXPOSE 8080

# Run the Go server, binding to the dynamic port provided by Render ($PORT)
CMD ["sh", "-c", "./main -scrape=false -serve=true -port=${PORT:-8080}"]
