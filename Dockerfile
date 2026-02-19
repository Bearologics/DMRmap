FROM golang:1.25-alpine AS builder
ARG GIT_COMMIT=unknown
WORKDIR /build
COPY go.mod go.sum ./
RUN go mod download
COPY *.go ./
COPY migrations/ ./migrations/
RUN CGO_ENABLED=0 go build -ldflags "-X main.version=${GIT_COMMIT}" -o dmrmap .

FROM alpine:3.19
WORKDIR /app
COPY --from=builder /build/dmrmap .
COPY --from=builder /build/migrations/ ./migrations/
COPY static/ ./static/
COPY rptrs.json .
COPY bmrptrs.json .
RUN wget -qO static/talkgroups.json https://api.brandmeister.network/v2/talkgroup
EXPOSE 8080
CMD ["./dmrmap"]
