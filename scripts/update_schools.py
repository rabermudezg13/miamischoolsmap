import csv
import json
import urllib.parse
import urllib.request
from pathlib import Path

SOURCE_URL = "https://services.arcgis.com/8Pc9XBTAsYuxx9Ny/arcgis/rest/services/SchoolSite_gdb/FeatureServer/0/query"
OUTPUT = Path("schools.csv")

params = {
    "where": "1=1",
    "outFields": "*",
    "returnGeometry": "true",
    "outSR": "4326",
    "f": "json",
}
url = f"{SOURCE_URL}?{urllib.parse.urlencode(params)}"
request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})

with urllib.request.urlopen(request, timeout=60) as response:
    payload = json.load(response)

if "error" in payload:
    raise RuntimeError(payload["error"])

fields = [
    "id", "name", "address", "city", "state", "zipcode", "phone",
    "email", "type", "grades", "latitude", "longitude"
]


def get_value(attrs, *names):
    lookup = {str(key).lower(): value for key, value in attrs.items()}
    for name in names:
        value = lookup.get(name.lower())
        if value not in (None, ""):
            return value
    return ""


rows = []
for feature in payload.get("features", []):
    attrs = feature.get("attributes", {})
    geometry = feature.get("geometry", {})

    latitude = get_value(attrs, "LAT", "LATITUDE") or geometry.get("y")
    longitude = get_value(attrs, "LON", "LONGITUDE") or geometry.get("x")
    name = get_value(attrs, "NAME", "SCHOOL_NAME", "SCH_NAME")

    if not name or latitude in (None, "") or longitude in (None, ""):
        continue

    rows.append({
        "id": get_value(attrs, "ID", "OBJECTID", "FID"),
        "name": name,
        "address": get_value(attrs, "ADDRESS", "STREET", "FULL_ADDRESS"),
        "city": get_value(attrs, "CITY", "MUNICIPALITY"),
        "state": "FL",
        "zipcode": get_value(attrs, "ZIPCODE", "ZIP", "ZIP_CODE"),
        "phone": get_value(attrs, "PHONE", "TELEPHONE"),
        "email": get_value(attrs, "EMAIL"),
        "type": get_value(attrs, "TYPE", "SCHOOL_TYPE", "SCH_TYPE"),
        "grades": get_value(attrs, "GRADES", "GRADE", "GRADE_LEVEL"),
        "latitude": latitude,
        "longitude": longitude,
    })

rows.sort(key=lambda row: (str(row["name"]).lower(), str(row["id"])))

if not rows:
    raise RuntimeError("No schools were returned by the Miami-Dade GIS service")

with OUTPUT.open("w", newline="", encoding="utf-8-sig") as csvfile:
    writer = csv.DictWriter(csvfile, fieldnames=fields)
    writer.writeheader()
    writer.writerows(rows)

print(f"Wrote {len(rows)} schools to {OUTPUT}")
