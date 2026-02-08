FROM golang:1.25-alpine AS builder
WORKDIR /build
COPY go.mod go.sum ./
RUN go mod download
COPY *.go ./
RUN CGO_ENABLED=0 go build -o dmrmap .

FROM alpine:3.19
WORKDIR /app
COPY --from=builder /build/dmrmap .
COPY static/ ./static/
COPY rptrs.json .
EXPOSE 8080
CMD ["./dmrmap"]
