import json

# 기존의 역 정보 JSON 파일을 불러옴
with open('seoul_metro.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

# 노선별로 좌표를 저장할 딕셔너리
line_coordinates = {
    "1호선": [],
    "2호선": [],
    "3호선": [],
    "4호선": [],
    "5호선": [],
    "6호선": [],
    "7호선": [],
    "8호선": [],
    "9호선": [],
    "인천1호선": [],
    "경의중앙선": [],
    "공항철도": [],
    "경춘선": [],
    "신분당선": [],
    "수인분당선": [],
    "우이신설선": []
}

# 각 노선별로 역 좌표를 수집
for line in data['DATA']:
    for node in line['node']:
        for station in node['station']:
            line_name = station['line']
            if line_name in line_coordinates:
                line_coordinates[line_name].append([station['lng'], station['lat']])

# GeoJSON 형식으로 변환
geojson_features = []
for line, coordinates in line_coordinates.items():
    feature = {
        "type": "Feature",
        "properties": {"line": line},
        "geometry": {
            "type": "LineString",
            "coordinates": coordinates
        }
    }
    geojson_features.append(feature)

geojson_data = {
    "type": "FeatureCollection",
    "features": geojson_features
}

# GeoJSON 파일로 저장
with open('seoul_metro_lines.geojson', 'w', encoding='utf-8') as f:
    json.dump(geojson_data, f, ensure_ascii=False, indent=4)

print("서울 지하철 노선 GeoJSON 파일 생성 완료!")
