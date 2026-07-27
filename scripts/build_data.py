#!/usr/bin/env python3
"""
Convierte el CSV de rutas (exportado/enriquecido) al JSON que consume la app.
Uso:
    python3 scripts/build_data.py ruta_al_csv.csv

Escribe siempre en data/rutas.json (sobrescribe).
"""
import csv
import json
import sys
import os

def to_float(v):
    v = (v or "").strip()
    if not v:
        return None
    try:
        return float(v)
    except ValueError:
        return None

def to_int(v):
    v = (v or "").strip()
    if not v:
        return None
    try:
        return int(float(v))
    except ValueError:
        return None

def to_str_or_none(v):
    v = (v or "").strip()
    return v if v else None

def to_bool(v):
    return (v or "").strip().lower() == "true"

def parse_row(row):
    caracteristicas = to_str_or_none(row.get("caracteristicas"))
    tags = [t.strip() for t in caracteristicas.split(";")] if caracteristicas else []

    return {
        "id": row["ruta_id"].strip(),
        "nombre": row["nombre"].strip(),
        "localidad": to_str_or_none(row.get("localidad")),
        "region": to_str_or_none(row.get("region")),
        "pais": to_str_or_none(row.get("pais")),
        "distancia_km": to_float(row.get("distancia_km")),
        "desnivel_positivo_m": to_int(row.get("desnivel_positivo_m")),
        "desnivel_negativo_m": to_int(row.get("desnivel_negativo_m")),
        "dificultad": to_str_or_none(row.get("dificultad")),
        "exigencia": to_str_or_none(row.get("exigencia")),
        "duracion_texto": to_str_or_none(row.get("duracion")),
        "duracion_min": to_int(row.get("duracion_min")),
        "tipo_ruta": to_str_or_none(row.get("tipo_ruta")),
        "altitud_maxima_m": to_int(row.get("altitud_maxima_m")),
        "altitud_minima_m": to_int(row.get("altitud_minima_m")),
        "trailrank": to_int(row.get("trailrank")),
        "fecha_realizacion": to_str_or_none(row.get("fecha_realizacion")),
        "caracteristicas": tags,
        "precauciones": to_str_or_none(row.get("precauciones")),
        "descripcion": to_str_or_none(row.get("descripcion")),
        "wikiloc_url": to_str_or_none(row.get("wikiloc_url")),
        "youtube_url": to_str_or_none(row.get("youtube_url")) if to_bool(row.get("youtube_disponible")) else None,
        # Procedencia del dato: "Wikiloc personal" para las rutas propias ya
        # grabadas/subidas a Wikiloc, o "Oficial · <organismo>" para rutas
        # importadas de un portal de datos abiertos (ayuntamiento, diputación,
        # gobierno regional...) que todavía no se han subido a Wikiloc.
        "origen": to_str_or_none(row.get("origen")) or "Wikiloc personal",
        # Enlace a la fuente oficial original (portal de datos abiertos, ficha
        # del ayuntamiento, etc.), cuando la ruta no viene de Wikiloc o cuando
        # queremos conservar la referencia aunque ya se haya subido a Wikiloc.
        "fuente_url": to_str_or_none(row.get("fuente_url")),
    }

def main():
    if len(sys.argv) < 2:
        print("Uso: python3 scripts/build_data.py ruta_al_csv.csv")
        sys.exit(1)

    csv_path = sys.argv[1]
    script_dir = os.path.dirname(os.path.abspath(__file__))
    out_path = os.path.join(script_dir, "..", "data", "rutas.json")

    with open(csv_path, encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rutas = [parse_row(r) for r in reader if r.get("ruta_id", "").strip()]

    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(rutas, f, ensure_ascii=False, indent=2)

    print(f"OK: {len(rutas)} rutas escritas en {out_path}")

if __name__ == "__main__":
    main()
