#!/bin/sh
set -eu

fake_ioc_pid=""

cleanup() {
  if [ -n "${fake_ioc_pid}" ]; then
    kill "${fake_ioc_pid}" 2>/dev/null || true
    wait "${fake_ioc_pid}" 2>/dev/null || true
  fi
}

if [ "${LUME_START_FAKE_EPICS:-0}" = "1" ]; then
  export EPICS_CA_AUTO_ADDR_LIST="${EPICS_CA_AUTO_ADDR_LIST:-NO}"
  export EPICS_CA_ADDR_LIST="${EPICS_CA_ADDR_LIST:-127.0.0.1}"
  python -m lume_visualizations.fake_epics_ioc --update-period "${LUME_FAKE_EPICS_UPDATE_PERIOD:-0.5}" &
  fake_ioc_pid="$!"
  echo "Started fake EPICS IOC with pid ${fake_ioc_pid}"
fi

trap cleanup EXIT INT TERM

"$@" &
app_pid="$!"
wait "${app_pid}"
app_status="$?"
cleanup
exit "${app_status}"
