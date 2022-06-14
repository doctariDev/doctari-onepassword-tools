#!/bin/bash

default_version="2.4.1"
version="${OP_VERSION:-$default_version}"

arch="$(node -e 'console.log(process.arch)')"
platform="$(node -e 'console.log(process.platform)')"
npm_root="$(npm root)"

mkdir -p "$npm_root/.bin"

function convertArch {
  case "$1" in
    "arm")
      echo "arm"
      ;;
    "arm64")
      echo "arm64"
      ;;
    "ia32")
      echo "386"
      ;;
    "x64")
      echo "amd64"
      ;;
    *)
      >&2 echo "unsupported architecture: $1"
      return 1
  esac
}

function install_darwin {
  local url="https://cache.agilebits.com/dist/1P/op2/pkg/v${version}/op_apple_universal_v${version}.pkg"
  curl -so "/tmp/op-download/pkg" "$url"
  tar xf "/tmp/op-download/pkg" -C "/tmp/op-download/x"
  tar xf "/tmp/op-download/x/op.pkg/Payload" -C "/tmp/op-download"
  mv "/tmp/op-download/op" "$npm_root/.bin"
  chmod a+x "$npm_root/.bin/op"
}

function install_linux {
  local op_arch="$(convertArch $arch)"
  if [[ ! -z "$op_arch" ]]; then
    local url="https://cache.agilebits.com/dist/1P/op2/pkg/v${version}/op_linux_${op_arch}_v${version}.zip"
    echo "$url"
    curl -so "/tmp/op-download/pkg" "$url"
    unzip "/tmp/op-download/pkg" -d "/tmp/op-download"
    mv "/tmp/op-download/op" "$npm_root/.bin"
    chmod a+x "$npm_root/.bin/op"
  fi
}

mkdir -p "/tmp/op-download/x"
case "$platform" in
  "darwin")
    install_darwin
    ;;
  "linux")
    install_linux
    ;;
  *)
    >&2 echo "Unsupported platform: $platform"
    ;;
esac
rm -r "/tmp/op-download"
