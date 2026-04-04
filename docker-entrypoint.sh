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

  # Wait until the heartbeat PV is readable (up to 15 s) so the first live
  # poll in the app doesn't race against IOC startup.
  echo "Waiting for fake EPICS IOC to become ready..."
  _ioc_ready=0
  for _i in $(seq 1 30); do
    if python - <<'EOF' 2>/dev/null
import epics, os
v = epics.caget("LUME:FAKEIOC:HEARTBEAT", timeout=0.5,
                connection_timeout=0.5)
raise SystemExit(0 if v is not None else 1)
EOF
    then
      _ioc_ready=1
      break
    fi
    sleep 0.5
  done
  if [ "${_ioc_ready}" = "1" ]; then
    echo "Fake EPICS IOC is ready."
  else
    echo "Warning: fake EPICS IOC did not respond within 15 s — continuing anyway."
  fi
fi

trap cleanup EXIT INT TERM

set +e
"$@"
app_status="$?"
set -e
exit "${app_status}"
