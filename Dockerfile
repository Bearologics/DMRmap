FROM node:22-alpine AS frontend
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci
COPY src/ ./src/
COPY tsconfig.json ./
RUN npm run build:prod

FROM golang:1.25-alpine AS builder
RUN apk add --no-cache git
WORKDIR /build
COPY .git ./.git
COPY go.mod go.sum ./
RUN go mod download
COPY *.go ./
COPY migrations/ ./migrations/
RUN CGO_ENABLED=0 go build -ldflags "-X main.version=$(git rev-parse --short HEAD)" -o dmrmap .

FROM alpine:3.19
WORKDIR /app
COPY --from=builder /build/dmrmap .
COPY --from=builder /build/migrations/ ./migrations/
COPY static/ ./static/
COPY --from=frontend /build/static/app.js ./static/app.js
COPY rptrs.json .
COPY bmrptrs.json .
RUN wget -qO static/talkgroups.json https://api.brandmeister.network/v2/talkgroup
EXPOSE 8080
CMD ["./dmrmap"]
