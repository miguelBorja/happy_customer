# --- Stage 1: Build the React Frontend ---
FROM node:20-alpine AS frontend-builder
WORKDIR /app/web
COPY web/package*.json ./
RUN npm install
COPY web/ ./
ARG VITE_GA_MEASUREMENT_ID
ENV VITE_GA_MEASUREMENT_ID=$VITE_GA_MEASUREMENT_ID
RUN npm run build

# --- Stage 2: Build the Go Backend ---
FROM golang:alpine AS backend-builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
# Copy the compiled React assets from the first stage
COPY --from=frontend-builder /app/web/dist ./web/dist
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
