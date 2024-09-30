// 지도 초기화
var map = L.map('map').setView([37.5665, 126.9780], 11); // 서울 중심 좌표

// OSM 타일 추가
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
}).addTo(map);

// 지도 상호작용 비활성화 (데이터 로딩 전까지)
map.dragging.disable();
map.doubleClickZoom.disable();
map.scrollWheelZoom.disable();
map.boxZoom.disable();
map.keyboard.disable();
if (map.tap) map.tap.disable();

// 레이어 그룹 생성
var markerLayer = L.layerGroup().addTo(map);
var circleLayer = L.layerGroup().addTo(map);
var highlightLayer;

// 반경 입력 요소 가져오기
var radiusInput = document.getElementById('radius-input');

// 데이터 변수 선언
var adminAreas; // 행정구역 데이터
var adminLayer;
var subwayStationsData; // 지하철역 데이터
var adminAreasTree; // 행정구역 RBush 인덱스
var subwayStationsTree; // 지하철역 RBush 인덱스

// 데이터 로드 프로미스 배열
var dataPromises = [];

// 노선 색상을 가져오는 함수 (중복 제거)
function getLineColor(line) {
  const lineColors = {
    '1호선': '#0052A4',
    '2호선': '#00A84D',
    '3호선': '#EF7C1C',
    '4호선': '#00A1E9',
    '5호선': '#996CAC',
    '6호선': '#CD7C2F',
    '7호선': '#747F00',
    '8호선': '#E6186C',
    '9호선': '#AA9872',
    '인천1호선': '#7CA8D5',
    '경의중앙선': '#77C4A3',
    '공항철도': '#0090D2',
    '경춘선': '#178C72',
    '신분당선': '#D31145',
    '수인분당선': '#FABE00',
    '우이신설선': '#B0CE18',
  };
  return lineColors[line] || '#000000';
}

// 행정구역 데이터 불러오기
var adminDataPromise = fetch('seoul_dong.geojson')
  .then(response => response.json())
  .then(data => {
    adminAreas = data;

    // RBush를 사용하여 행정구역 인덱싱
    adminAreasTree = rbush();
    var adminItems = adminAreas.features.map(function(feature) {
      var bbox = turf.bbox(feature);
      return {
        minX: bbox[0],
        minY: bbox[1],
        maxX: bbox[2],
        maxY: bbox[3],
        feature: feature
      };
    });
    adminAreasTree.load(adminItems);

    // 지도에 행정구역 경계 표시 (선택 사항)
    adminLayer = L.geoJSON(adminAreas, {
      style: {
        color: '#3388ff',
        weight: 1,
        fillOpacity: 0.2,
      },
    }).addTo(map);
  })
  .catch(error => {
    console.error('행정구역 데이터를 불러오는 중 에러 발생:', error);
    alert('행정구역 데이터를 불러오는 중 에러가 발생했습니다.');
  });

dataPromises.push(adminDataPromise);

// 지하철역 데이터 불러오기
var subwayDataPromise = fetch('seoul_metro.geojson')
  .then(response => response.json())
  .then(data => {
    subwayStationsData = data;

    // RBush를 사용하여 지하철역 인덱싱
    subwayStationsTree = rbush();
    var stationItems = subwayStationsData.features.map(function(feature) {
      var coords = feature.geometry.coordinates;
      return {
        minX: coords[0],
        minY: coords[1],
        maxX: coords[0],
        maxY: coords[1],
        feature: feature
      };
    });
    subwayStationsTree.load(stationItems);
  })
  .catch(error => {
    console.error('지하철역 데이터를 불러오는 중 에러 발생:', error);
    alert('지하철역 데이터를 불러오는 중 에러가 발생했습니다.');
  });

dataPromises.push(subwayDataPromise);

// 서울 지하철 노선 경로를 지도에 추가 (노선도 시각화)
var subwayLinesPromise = fetch('seoul_metro_lines.geojson')
  .then(response => response.json())
  .then(subwayLines => {
    L.geoJSON(subwayLines, {
      style: function (feature) {
        return {
          color: getLineColor(feature.properties.line),
          weight: 3,
          opacity: 0.85
        };
      }
    }).addTo(map);
  })
  .catch(error => {
    console.error('지하철 노선 데이터를 불러오는 중 에러 발생:', error);
    alert('지하철 노선 데이터를 불러오는 중 에러가 발생했습니다.');
  });

dataPromises.push(subwayLinesPromise);

// 모든 데이터 로드가 완료되면 지도 상호작용 활성화
Promise.all(dataPromises).then(() => {
  // 지도 상호작용 활성화
  map.dragging.enable();
  map.doubleClickZoom.enable();
  map.scrollWheelZoom.enable();
  map.boxZoom.enable();
  map.keyboard.enable();
  if (map.tap) map.tap.enable();
}).catch(error => {
  console.error('데이터 로딩 중 에러 발생:', error);
});

// 지도 클릭 이벤트 처리
map.on('click', function (e) {
  if (!adminAreas || !subwayStationsData) {
    alert('데이터가 아직 로드되지 않았습니다. 잠시 후 다시 시도하세요.');
    return;
  }

  // 이전 마커와 원 제거
  markerLayer.clearLayers();
  circleLayer.clearLayers();

  var clickedPoint = e.latlng;

  // 반경 값 가져오기 (미터 단위)
  var radius = parseInt(radiusInput.value) || 1000;

  // 마커 추가
  L.marker(clickedPoint).addTo(markerLayer);

  // 원 추가
  var circle = L.circle(clickedPoint, {
    radius: radius,
    color: 'red',
    fillOpacity: 0.1,
  }).addTo(circleLayer);

  // 공간 연산 수행 (교차 여부 확인)
  performSpatialQuery(clickedPoint, radius);
});

// 공간 연산 함수 (행정구역 및 지하철역 찾기)
function performSpatialQuery(clickedPoint, radius) {
  // Turf.js 포인트 생성
  var point = turf.point([clickedPoint.lng, clickedPoint.lat]);

  // 버퍼 생성 (반경 내 영역)
  var buffer = turf.buffer(point, radius, { units: 'meters' });

  var bufferBbox = turf.bbox(buffer);

  var insideAreas = [];
  var insideStations = new Set(); // Set을 사용해 중복 제거

  // 이전에 강조된 영역 제거
  if (highlightLayer) {
    map.removeLayer(highlightLayer);
  }

  // 1. 행정구역 데이터의 각 폴리곤에 대해 교차 여부 판단 (RBush 사용)
  var possibleFeatures = adminAreasTree.search({
    minX: bufferBbox[0],
    minY: bufferBbox[1],
    maxX: bufferBbox[2],
    maxY: bufferBbox[3]
  }).map(item => item.feature);

  possibleFeatures.forEach(function(feature) {
    var intersects = turf.booleanIntersects(buffer, feature);
    if (intersects) {
      insideAreas.push(feature.properties.adm_nm);
    }
  });

  // 2. 지하철역 데이터의 각 역에 대해 교차 여부 판단 (RBush 사용)
  var possibleStations = subwayStationsTree.search({
    minX: bufferBbox[0],
    minY: bufferBbox[1],
    maxX: bufferBbox[2],
    maxY: bufferBbox[3]
  }).map(item => item.feature);

  possibleStations.forEach(function(station) {
    const lat = station.geometry.coordinates[1]; // 위도
    const lng = station.geometry.coordinates[0]; // 경도

    if (typeof lat === 'number' && typeof lng === 'number') {
      var stationPoint = turf.point([lng, lat]); // 좌표를 [경도, 위도]로 처리
      var isInside = turf.booleanPointInPolygon(stationPoint, buffer);

      if (isInside) {
        const stationName = station.properties.name + '역'; // "역"을 추가
        insideStations.add(stationName); // Set을 사용해 중복 제거

        // 역이 속한 노선의 색상 가져오기
        const lineColor = getLineColor(station.properties.line);

        // 커스텀 심볼(별표) 추가 (해당 역의 색상 적용)
        const icon = L.divIcon({
          className: 'custom-icon',
          html: `
            <div style="
              color: ${lineColor};
              font-size: 25px;
              opacity: 0.85;
              text-shadow: 1px 1px 3px rgba(0, 0, 0, 0.3);
            ">★</div>`,
          iconSize: [25, 25],
          iconAnchor: [12, 12]
        });

        L.marker([lat, lng], { icon: icon }).addTo(markerLayer).bindPopup(stationName);
      }
    } else {
      console.error('지하철역 좌표 오류 (숫자가 아님):', { lat, lng });
    }
  });

  // 결과 출력
  displayResults(insideAreas, Array.from(insideStations)); // Set을 배열로 변환

  // 범위 내의 행정구역을 지도에 강조 표시
  highlightIntersectingAreas(insideAreas);
}

// 행정구역 출력 시 구와 동 정보만 출력
function displayResults(areaNames, stationNames) {
  var areaList = document.getElementById('area-list');
  areaList.innerHTML = ''; // 이전 결과 제거

  // 행정구역 결과
  var resultHTML = '<h3>범위 내 행정구역 (구/동):</h3>';
  
  // "서울특별시"를 제거하고, "구"나 "동"이 포함된 이름만 필터링
  const processedAreas = areaNames.map(name => name.replace('서울특별시 ', '').trim());
  const filteredAreas = processedAreas.filter(name => name.includes('구') || name.includes('동'));
  
  if (filteredAreas.length === 0) {
    resultHTML += '<ul><li>범위 내에 행정구역이 없습니다.</li></ul>';
  } else {
    resultHTML += '<ul>' + filteredAreas.map(name => `<li>${name}</li>`).join('') + '</ul>';
  }

  // 지하철역 결과
  resultHTML += '<h3>범위 내 지하철역:</h3>';
  if (stationNames.length === 0) {
    resultHTML += '<ul><li>범위 내에 지하철역이 없습니다.</li></ul>';
  } else {
    resultHTML += '<ul>' + stationNames.map(name => `<li>${name}</li>`).join('') + '</ul>';
  }

  // 결과를 페이지에 삽입
  areaList.innerHTML = resultHTML;
}

// 강조 표시 함수 (행정구역만 강조)
function highlightIntersectingAreas(areaNames) {
  var highlightFeatures = adminAreas.features.filter(function (feature) {
    return areaNames.includes(feature.properties.adm_nm);
  });

  if (highlightLayer) {
    map.removeLayer(highlightLayer);
  }

  highlightLayer = L.geoJSON(
    { type: 'FeatureCollection', features: highlightFeatures },
    {
      style: {
        color: 'orange',
        weight: 2,
        fillOpacity: 0.3,
      },
    }
  ).addTo(map);
}

// 병원 분과와 관련된 키워드 구조화
const departmentKeywords = {
  "항문외과": ["항문외과", "항외과", "치질병원", "치질수술병원", "치질수술잘하는곳", "내시경병원"],
  "내과": ["내과", "소화기내과", "호흡기내과", "심장내과", "내시경 병원", "건강검진 병원", "건강검진", "대장내시경 병원", "위내시경 병원"],
  "정형외과": ["정형외과", "디스크병원", "허리디스크병원", "목디스크병원", "재활병원", "관절", "골절", "디스크"],
  "신경외과": ["신경외과", "두통", "뇌출혈", "허리디스크"],
  "산부인과": ["산부인과", "부인과", "출산", "여성클리닉", "자궁경부암 건강검진"],
  "소아청소년과": ["소아청소년과", "소아과", "아이", "소아질환"],
  "피부과": ["피부과", "여드름", "리프팅", "피부질환"],
  "안과": ["안과", "백내장", "라식", "눈수술"],
  "이비인후과": ["이비인후과", "비염", "코막힘", "목감기"],
  "비뇨의학과": ["비뇨의학과", "비뇨기과", "전립선", "요로결석"],
  "재활의학과": ["재활의학과", "물리치료", "재활치료", "운동치료"],
  "정신건강의학과": ["정신건강의학과", "우울증", "불안장애", "정신과"],
  "가정의학과": ["가정의학과", "건강검진", "다이어트", "비만클리닉"],
  "흉부외과": ["흉부외과", "심장수술", "폐질환", "대동맥수술"],
  "치과": ["치과", "임플란트", "교정", "치아미백"],
  "성형외과": ["성형외과", "쌍꺼풀수술", "코수술"],
  "마취통증의학과": ["통증의원", "통증의학과", "마취통증의학과", "통증과", "디스크병원", "허리디스크병원", "목디스크병원", "디스크"]
};

// 키워드 저장 변수
let keywords = [];



// 동 이름을 통일하는 함수 ("동" 앞에 숫자가 있을 경우 처리)
function normalizeDongName(dongName) {
  // "동" 직전에 숫자가 있는 경우 숫자를 제거 (장위1동 -> 장위동)
  return dongName.replace(/(\d+)(?=동$)/, '');
}

// "구"를 제외하고 "동"만 반환하는 함수 (키워드 생성 시 사용)
function extractDongOnly(areaName) {
  return areaName.replace(/.*구\s?/, '').trim(); // "구"를 제거하고 "동"만 반환
}

// 동 이름을 통일하는 함수 ("동" 앞에 숫자가 있을 경우 처리)
function normalizeDongName(dongName) {
  // "동" 직전에 숫자가 있는 경우 숫자를 제거 (장위1동 -> 장위동)
  return dongName.replace(/(\d+)(?=동$)/, '');
}

// "구"를 제외하고 "동"만 반환하는 함수 (키워드 생성 시 사용)
function extractDongOnly(areaName) {
  return areaName.replace(/.*구\s?/, '').trim(); // "구"를 제거하고 "동"만 반환
}

// 지도 클릭 이벤트 처리 (키워드 생성 및 출력)
map.on('click', function (e) {
  var clickedPoint = e.latlng;
  var radius = parseInt(document.getElementById('radius-input').value) || 1000;

  // 선택된 병원 분과 가져오기
  var selectedDepartment = document.getElementById('department-select').value;
  if (!selectedDepartment) {
    alert('먼저 병원 분과를 선택하세요!');
    return;
  }

  // 선택된 분과에 해당하는 하위 키워드 가져오기
  var relatedKeywords = departmentKeywords[selectedDepartment];
  if (!relatedKeywords) {
    alert('선택된 분과에 대한 키워드가 없습니다.');
    return;
  }

  // 1. 행정구역(동) 정보 가져오기 (구 단위 제거 및 통합)
  var insideAreasSet = new Set(); // Set을 사용해 중복 제거
  adminAreasTree.search({
    minX: clickedPoint.lng - radius / 111320,
    minY: clickedPoint.lat - radius / 110540,
    maxX: clickedPoint.lng + radius / 111320,
    maxY: clickedPoint.lat + radius / 110540
  }).forEach(function (item) {
    let areaName = item.feature.properties.adm_nm.replace('서울특별시 ', '').trim();
    
    // 동 이름 통일 (숫자 앞에 동이 있으면 통일)
    areaName = normalizeDongName(areaName);

    // "구"와 "동"이 포함된 이름만 처리하고 중복을 Set으로 방지
    if (areaName.includes('구') && areaName.includes('동')) {
      insideAreasSet.add(areaName); // 중복 없이 Set에 추가
    }
  });

  // 2. 지하철역 정보 가져오기
  var insideStations = new Set();
  subwayStationsTree.search({
    minX: clickedPoint.lng - radius / 111320,
    minY: clickedPoint.lat - radius / 110540,
    maxX: clickedPoint.lng + radius / 111320,
    maxY: clickedPoint.lat + radius / 110540
  }).forEach(function (item) {
    const stationName = item.feature.properties.name + '역'; // "역"을 추가
    insideStations.add(stationName);
  });

  // 키워드 생성 로직
  keywords = []; // 기존 키워드를 초기화
  
  // 동 이름과 분과 관련 키워드를 조합 (구는 제외하고 동만 사용)
  Array.from(insideAreasSet).forEach(function(area) {
    const dongOnly = extractDongOnly(area); // 구를 제외하고 동만 추출
    relatedKeywords.forEach(function(keyword) {
      keywords.push(`${dongOnly} ${keyword}`);
    });
  });

  // 지하철역 이름과 분과 관련 키워드를 조합
  Array.from(insideStations).forEach(function(station) {
    relatedKeywords.forEach(function(keyword) {
      keywords.push(`${station} ${keyword}`);
    });
  });

  // 생성된 키워드를 화면에 표시 (가로로 나열)
  var keywordListElement = document.getElementById('keyword-list');
  keywordListElement.innerHTML = ''; // 기존 내용 초기화

  if (keywords.length > 0) {
    keywords.forEach(function(keyword) {
      var keywordItem = document.createElement('span'); // span을 사용해 가로로 나열
      keywordItem.textContent = keyword + ', '; // 각 키워드 뒤에 쉼표 추가
      keywordListElement.appendChild(keywordItem);
    });
  } else {
    console.log("키워드가 생성되지 않음.");
  }

  console.log('생성된 키워드:', keywords);
});



// 키워드 다운로드 기능
document.getElementById('download-btn').addEventListener('click', function() {
  if (keywords.length === 0) {
    alert('생성된 키워드가 없습니다.');
    return;
  }

  // 키워드를 텍스트 파일로 변환
  var blob = new Blob([keywords.join('\n')], { type: 'text/plain' });
  var url = window.URL.createObjectURL(blob);

  // 다운로드 링크 생성 및 확인
  console.log('생성된 다운로드 URL:', url);

  var a = document.createElement('a');
  a.href = url;
  a.download = 'generated_keywords.txt';
  a.click(); // 다운로드 실행

  // URL 해제
  window.URL.revokeObjectURL(url);
});
