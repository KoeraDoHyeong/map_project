import json

# JSON 파일 불러오기
with open('seoul_metro.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# GeoJSON 형식의 Feature 리스트 생성
features = []

for line in data['DATA']:
    for node in line['node']:
        for station in node['station']:
            feature = {
                "type": "Feature",
                "geometry": {
                    "type": "Point",
                    "coordinates": [station['lng'], station['lat']]
                },
                "properties": {
                    "line": station['line'],
                    "name": station['name'],
                    "station_cd": station['station_cd'],
                    "station_nm_eng": station['station_nm_eng']
                }
            }
            features.append(feature)

# FeatureCollection 생성
geojson_data = {
    "type": "FeatureCollection",
    "features": features
}

# GeoJSON 파일로 저장
with open('seoul_metro.geojson', 'w', encoding='utf-8') as f:
    json.dump(geojson_data, f, ensure_ascii=False, indent=4)
