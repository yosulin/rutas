#!/usr/bin/env python3
"""
Utilidad compartida por build_data.py y merge_tracks.py: escribe
data/version.json al terminar cada script, para que la web pueda mostrar
cuándo se actualizaron los datos por última vez y con cuántas rutas cuenta.

No es un dato de ruta: es metadata del propio despliegue.
"""
import json
from datetime import datetime, timezone
from pathlib import Path

# Mantener sincronizado a mano con CACHE_VERSION en sw.js en cada release.
APP_BUILD = "v7"


def write_version(data_dir: Path, total_rutas: int) -> Path:
    data_dir = Path(data_dir)
    version_path = data_dir / "version.json"
    payload = {
        "generado_en": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "total_rutas": total_rutas,
        "app_build": APP_BUILD,
    }
    version_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"OK: version.json escrito en {version_path} ({payload['generado_en']}, {total_rutas} rutas)")
    return version_path
