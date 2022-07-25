#!/usr/bin/env bash

script_dir="$( cd -- "$( dirname -- "${BASH_SOURCE[0]:-$0}"; )" &> /dev/null && pwd 2> /dev/null; )";
output_dir="$(dirname $script_dir)/dist"

if settings=$($script_dir/op-install-settings.js); then
  eval "$settings"
  echo "[op-install] Downloading op cli from $op_download_url"
  curl -so "/tmp/op.pkg" "$op_download_url"
  case "$op_package_type" in
    "pkg")
      tar xOf "/tmp/op.pkg" "op.pkg/Payload" | tar x -C "$output_dir"
      ;;
    "zip")
      unzip "/tmp/op.pkg" -d "$output_dir"
      ;;
  esac
  rm "/tmp/op.pkg"
  echo "[op-install] Done"
fi
