import csv
import json
import urllib.parse
import urllib.request
from pathlib import Path

SOURCE_URL = "https://arcgis.gdsc.miami.edu/arcgis/rest/services/mdc_public_schools/FeatureServer/1/query"
OUTPUT = Path("schools.csv")

params = {
    "where": "1=1",
    "outFields": "*",
    "returnGeometry": "true",
    "outSR": "4326",
    "f": "json",
}
url = f"{SOURCE_URL}?{urllib.parse.urlencode(params)}"
request = urllib.request.Request(url, headers={"User-Agent": "MiamiSchoolsMap/1.0"})

with urllib.request.urlopen(request, timeout=60) as response:
    payload = json.load(response)

if "error" in payload:
    raise RuntimeError(payload["error"])

fields = [
    "id", "name", "campus", "address", "unit", "city", "state", "zipcode",
    "phone", "email", "type", "grades", "capacity", "enrollment", "region",
    "latitude", "longitude", "source_url"
]

rows = []
for feature in payload.get("features", []):
    attrs = feature.get("attributes", {})
    geometry = feature.get("geometry", {})
    latitude = attrs.get("lat") or geometry.get("y")
    longitude = attrs.get("lon") or geometry.get("x")
    if latitude is None or longitude is None:
        continue
    rows.append({
        "id": attrs.get("id", ""),
        "name": attrs.get("name", ""),
        "campus": attrs.get("campus", ""),
        "address": attrs.get("address", ""),
        "unit": attrs.get("unit", ""),
        "city": attrs.get("city", ""),
        "state": "FL",
        "zipcode": attrs.get("zipcode", ""),
        "phone": attrs.get("phone", ""),
        "email": attrs.get("email", ""),
        "type": attrs.get("type", ""),
        "grades": attrs.get("grades", ""),
        "capacity": attrs.get("capacity", ""),
        "enrollment": attrs.get("enrollmnt", ""),
        "region": attrs.get("region", ""),
        "latitude": latitude,
        "longitude": longitude,
        "source_url": SOURCE_URL,
    })

rows.sort(key=lambda row: (str(row["name"]).lower(), str(row["id"])))

with OUTPUT.open("w", newline="", encoding="utf-8-sig") as csvfile:
    writer = csv.DictWriter(csvfile, fieldnames=fields)
    writer.writeheader()
    writer.writerows(rows)

print(f"Wrote {len(rows)} schools to {OUTPUT}")
