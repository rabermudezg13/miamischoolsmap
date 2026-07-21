# Miami Public Schools Map

Interactive map of Miami-Dade public schools built with Leaflet and the Miami-Dade public GIS service.

## Features

- Interactive map with clustered school markers
- Search by school name, address, ZIP code, city, or grade level
- School-type filters
- Locate the user and show nearby schools
- Responsive layout for desktop and mobile
- Live data from Miami-Dade's public ArcGIS service

## Run locally

Because the app loads public GIS data, serve the folder through a local web server instead of opening `index.html` directly:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Publish with GitHub Pages

In the repository settings, open **Pages**, choose **Deploy from a branch**, select `main` and `/ (root)`, then save.

## Data source

Miami-Dade public schools ArcGIS Feature Service:

`https://arcgis.gdsc.miami.edu/arcgis/rest/services/mdc_public_schools/FeatureServer/1`
