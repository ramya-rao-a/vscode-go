FROM golang:1.6-alpine
MAINTAINER João Moreno

RUN apk add --no-cache git

# gcc and musl-dev are needed for gorename to work
RUN apk add --no-cache gcc
RUN apk add --no-cache musl-dev

RUN go get -u -v github.com/nsf/gocode
RUN go get -u -v github.com/rogpeppe/godef
RUN go get -u -v github.com/golang/lint/golint
RUN go get -u -v github.com/lukehoban/go-outline
RUN go get -u -v sourcegraph.com/sqs/goreturns
RUN go get -u -v golang.org/x/tools/cmd/gorename
RUN go get -u -v github.com/tpng/gopkgs
RUN go get -u -v github.com/newhook/go-symbols
RUN go get -u -v golang.org/x/tools/cmd/guru

# Delve install
RUN go get github.com/derekparker/delve/cmd/dlv

RUN mkdir /var/workspace

ENTRYPOINT tail -f /dev/null
