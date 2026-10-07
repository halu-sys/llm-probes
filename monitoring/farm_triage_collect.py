#!/usr/bin/env python3
"""Farm triage collector: cheap, no-LLM snapshot of rig1 health.

Pulls Prometheus range stats + Strata status + llama-swap metrics,
computes anomaly flags against thresholds, prints a compact snapshot
for the triage agent. Exit 0 always (the agent reasons about flags).
"""
import json
import time
import urllib.parse
import urllib.request

PROM = "http://127.0.0.1:9090"
STRATA = "http://127.0.0.1:9100"
SWAP = "http://127.0.0.1:1236"

THRESH = {
    "gpu_temp_c": 85,
    "vram_free_mib": 256,
    "ram_free_gib": 2,
    "decode_tok_s_min": 40,
    "cache_hit_min": 0.5,
    "load1_max_cores": 1.5,  # x cores
}


def get(url, timeout=5):
    try:
        with urllib.request.urlopen(url, timeout=timeout) as r:
            return r.read().decode()
    except Exception as e:
        return f"__ERR__ {e}"


def prom_instant(q):
    raw = get(f"{PROM}/api/v1/query?query={urllib.parse.quote(q)}")
    if raw.startswith("__ERR__"):
        return {"error": raw}
    d = json.loads(raw)
    return [
        {"labels": r["metric"], "value": float(r["value"][1])}
        for r in d.get("data", {}).get("result", [])
    ]


def prom_range_avg(q, hours=6):
    end = int(time.time())
    start = end - hours * 3600
    url = f"{PROM}/api/v1/query_range?query={urllib.parse.quote(q)}&start={start}&end={end}&step=300"
    raw = get(url)
    if raw.startswith("__ERR__"):
        return {"error": raw}
    d = json.loads(raw)
    out = []
    for r in d.get("data", {}).get("result", []):
        vals = [float(v[1]) for v in r["values"] if v[1] not in ("NaN",)]
        if vals:
            out.append({
                "labels": r["metric"],
                "avg": round(sum(vals) / len(vals), 2),
                "max": round(max(vals), 2),
                "min": round(min(vals), 2),
            })
    return out


snap = {"collector": "farm_triage_collect/v1"}

# --- Prometheus range stats (6h window) ---
snap["gpu_temp_6h"] = prom_range_avg("llamaswap_gpu_temperature_celsius")
snap["gpu_util_6h"] = prom_range_avg("llamaswap_gpu_util_percent")
snap["gpu_power_6h"] = prom_range_avg("llamaswap_gpu_power_draw_watts")
snap["gpu_vram_used_6h"] = prom_range_avg("llamaswap_gpu_memory_used_bytes")
snap["ram_free_6h"] = prom_range_avg("node_memory_MemAvailable_bytes")
snap["load1_6h"] = prom_range_avg("node_load1")
snap["cores"] = prom_instant("count(node_cpu_seconds_total{mode='system'})")

# --- Strata engine status (live serving state) ---
raw = get(f"{STRATA}/metrics")
if raw.startswith("__ERR__"):
    snap["strata"] = {"error": raw}
else:
    try:
        st = json.loads(raw)
        eng = st.get("engine", {})
        reqs = st.get("requests", [])[:10]
        hist = st.get("history", {})
        snap["strata"] = {
            "model": eng.get("model"),
            "max_context": eng.get("max_context"),
            "vram_free_mib": eng.get("vram_free_mib") or 99999,
            "expert_cache_mib": eng.get("expert_cache_mib"),
            "recent_requests": [
                {
                    "finish": r.get("finish"),
                    "prompt_tokens": r.get("prompt_tokens"),
                    "reused": r.get("reused"),
                    "hit_rate": r.get("hit_rate"),
                    "decode_tok_s": r.get("decode_tok_s"),
                    "drafts_offered": r.get("drafts_offered"),
                    "drafts_accepted": r.get("drafts_accepted"),
                }
                for r in reqs
            ],
            "tok_s_history_nonzero": sum(1 for v in hist.get("tok_s", []) if v),
        }
    except Exception as e:
        snap["strata"] = {"error": f"parse: {e}"}

# --- llama-swap: is the proxy itself up ---
raw = get(f"{SWAP}/metrics")
snap["llamaswap_up"] = not raw.startswith("__ERR__")

# --- anomaly flags ---
flags = []
for s in snap.get("gpu_temp_6h", [] if isinstance(snap.get("gpu_temp_6h"), list) else []):
    if isinstance(s, dict) and s["max"] > THRESH["gpu_temp_c"]:
        flags.append(f"GPU {s['labels'].get('name','?')} temp max {s['max']}C > {THRESH['gpu_temp_c']}")
ram = snap.get("ram_free_6h")
if isinstance(ram, list) and ram:
    free_gib = ram[0]["min"] / 2**30
    if free_gib < THRESH["ram_free_gib"]:
        flags.append(f"RAM free min {free_gib:.1f} GiB < {THRESH['ram_free_gib']}")
st = snap.get("strata", {})
if isinstance(st, dict):
    if st.get("vram_free_mib", 99999) < THRESH["vram_free_mib"]:
        flags.append(f"VRAM free {st['vram_free_mib']} MiB < {THRESH['vram_free_mib']} (parking pressure)")
    for i, r in enumerate(st.get("recent_requests", [])):
        if r.get("hit_rate") is not None and r["hit_rate"] < THRESH["cache_hit_min"]:
            flags.append(f"req[{i}] cache hit {r['hit_rate']} < {THRESH['cache_hit_min']}")
        if r.get("decode_tok_s") and r["decode_tok_s"] < THRESH["decode_tok_s_min"]:
            flags.append(f"req[{i}] decode {r['decode_tok_s']} tok/s < {THRESH['decode_tok_s_min']}")
if not snap.get("llamaswap_up"):
    flags.append("llama-swap /metrics unreachable")
if isinstance(st, dict) and "error" in st:
    flags.append("Strata status unreachable")
cores = snap.get("cores", [])
if isinstance(cores, list) and cores:
    n = cores[0]["value"]
    ld = snap.get("load1_6h")
    if isinstance(ld, list) and ld and ld[0]["max"] > n * THRESH["load1_max_cores"]:
        flags.append(f"load1 max {ld[0]['max']} > {THRESH['load1_max_cores']}x{int(n)} cores")
snap["flags"] = flags
snap["thresholds"] = THRESH

print(json.dumps(snap, indent=1, default=str))
