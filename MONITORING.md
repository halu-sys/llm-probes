# Observability stack (rig1)

Local Prometheus + Grafana + node_exporter, no containers, no cloud.
Binaries under ~/monitoring/, configs in-repo (monitoring/) for
reproducibility.

## Components

| service | port | role |
|---|---|---|
| llama-swap `/metrics` | 1236 (existing) | GPU util/VRAM/temp/power/fan + node stats — native Prometheus endpoint, zero extra exporters needed |
| node_exporter | 9101 | system RAM/CPU/disk (9100 taken by the Strata status server — port-collision gotcha) |
| Prometheus | 9090 | scrape 15s, 30d retention, `--web.enable-lifecycle` for hot reload |
| Grafana OSS | 3000 | provisioned datasource + "LLM Farm — rig1" dashboard (7 panels: GPU util/VRAM/temp/power/fan, RAM, load) |

All bound to 127.0.0.1 — nothing exposed on the LAN.

## Start (after reboot)

```
cd ~/monitoring
./node_exporter-1.9.1.linux-amd64/node_exporter --web.listen-address=127.0.0.1:9101 &
./prometheus-3.15.0.linux-amd64/prometheus --config.file=prometheus.yml \
  --web.listen-address=127.0.0.1:9090 --web.enable-lifecycle \
  --storage.tsdb.path=data --storage.tsdb.retention.time=30d &
./grafana-v11.6.0/bin/grafana server --homepath grafana-v11.6.0 web \
  --config defaults --http.addr=127.0.0.1 --http.port=3000 &
```

## Verify

```
curl -s http://127.0.0.1:9090/api/v1/targets | jq '.data.activeTargets[] | {job, health}'
curl -s http://127.0.0.1:3000/api/health
```

Verified live (2026-10-07): both targets `up`, Grafana datasource
health OK, panel queries return both GPUs (RTX 4070 Ti SUPER +
RTX 3090) with real telemetry.

## Gotchas hit during setup (real, not hypothetical)

- node_exporter default port 9100 collides with the Strata status
  server; moved to 9101.
- Grafana provisioning files live under `conf/provisioning/`, not the
  top-level `provisioning/` — silent no-op until moved.
- llama-swap labels GPUs with `name=`, not `gpu_name=` — legend
  templates must match actual label set (check via
  `/api/v1/query?query=<metric>` before writing panels).
