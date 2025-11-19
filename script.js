// Map and marker variables
let map;
let markers = [];
let markerClusterGroup;
let usableClusterGroup;
let territorialLayer; 
let portLayer; // 항구 레이어
let currentLayer;
let allIslands = [];
let islandMarkers = new Map(); 
let regionPolygon = null; 

// 페이지네이션 상태
const ITEMS_PER_PAGE = 3; // 3개씩 보기 유지
let islandListPage = 1;
let territorialListPage = 1;
let viewportListPage = 1;
let currentIslandListItems = []; 
let currentViewportItems = [];

const territorialIslands = [
    "호미곶", "1.5미이터암", "생도", "간여암", "하백도", 
    "사수도", "절명서", "소국흘도", "고서", "직도", "서격렬비도", "소령도",
    "홍도"
];

const regionMapping = {
    '경기도': ['경기도', '인천광역시'],
    '충청도': ['충청북도', '충청남도', '세종특별자치시'],
    '전라남도': ['전라남도'],
    '전라북도': ['전라북도', '전북특별자치도'],
    '경상남도': ['경상남도', '부산광역시', '울산광역시'],
    '경상북도': ['경상북도', '대구광역시'],
    '강원도': ['강원특별자치도', '강원도'],
    '제주도': ['제주특별자치도', '제주도']
};

const mapStyles = {
    default: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 19 }),
    satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: '© Esri', maxZoom: 19 }),
    terrain: L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', { attribution: '© OpenTopoMap', maxZoom: 17 }),
    dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '© CARTO', maxZoom: 19 })
};

function dmsToDecimal(dmsString) {
    if (!dmsString || typeof dmsString !== 'string') return null;
    const cleaned = dmsString.trim();
    let match = cleaned.match(/(\d+)[°]\s*(\d+)[′']\s*([\d.]+)[″"]\s*([NSEW])/);
    if (!match) match = cleaned.match(/(\d+)\s*deg\s*(\d+)\s*min\s*([\d.]+)\s*sec\s*([NSEW])/i);
    if (!match) match = cleaned.match(/(-?\d+\.?\d*)\s*([NSEW])/);
    if (!match) {
        const decimalMatch = cleaned.match(/(-?\d+\.?\d*)/);
        return decimalMatch ? parseFloat(decimalMatch[1]) : null;
    }
    if (match.length === 3) {
        let decimal = parseFloat(match[1]);
        return (match[2] === 'S' || match[2] === 'W') ? -decimal : decimal;
    }
    let decimal = parseFloat(match[1]) + (parseFloat(match[2]) / 60) + (parseFloat(match[3]) / 3600);
    if (match[4] === 'S' || match[4] === 'W') decimal = -decimal;
    return decimal;
}

function formatAddress(island) {
    const sido = island.Column3 || '';
    const sigungu = island.Column4 || '';
    let addressParts = [];
    if (sido && sigungu) {
        addressParts.push((sido.includes('광역시') || sido.includes('특별시')) ? `${sido} ${sigungu}` : sido, sigungu);
    } else if (sido) {
        addressParts.push(sido);
    }
    const parts = [island.Column5, island.Column6, island.Column7].filter(p => p && p.trim() !== '');
    return addressParts.concat(parts).join(' ') || '주소 정보 없음';
}

function checkIsTerritorial(island) {
    const name = island['무인도서 정보'];
    const code = island.Column2;
    const sido = island.Column3;
    if (code && code.includes('영해기점-')) return true;
    if (name === '홍도') { return sido === '경상남도'; }
    const requiredNames = ["호미곶", "1.5미이터암", "생도", "간여암", "하백도", "사수도", "절명서", "소국흘도", "고서", "직도", "서격렬비도", "소령도"];
    return requiredNames.includes(name);
}

function checkIsUsable(island) {
    return island.Column21 === '이용가능';
}

function createTooltipContent(island) {
    const name = island['무인도서 정보'] || '이름 없음';
    const address = formatAddress(island);
    const isTerritorial = checkIsTerritorial(island);
    const isUsable = checkIsUsable(island);
    
    let html = `<div class="tooltip-title">
                    <span>${name}</span>
                    <div style="display:flex;">
                        ${isTerritorial ? '<span class="territorial-badge">영해기점</span>' : ''}
                        ${isUsable ? '<span class="usable-badge">이용가능</span>' : ''}
                    </div>
                </div>`;
    html += `<div class="tooltip-info"><strong>소재지:</strong> ${address}</div>`;
    html += `<div class="tooltip-info"><strong>관리유형:</strong> ${island.Column21 || '정보 없음'}</div>`;
    return html;
}

function createDetailContent(island) {
    const address = formatAddress(island);
    const name = island['무인도서 정보'] || '이름 없음';
    
    let isTerritorial = checkIsTerritorial(island);
    let territorialText = isTerritorial ? "영해기점" : (island.Column20 || "해당 없음");
    if (territorialText === '영해기점 없음') territorialText = "해당 없음";
    const territorialStyle = isTerritorial ? 'color: #e74c3c; font-weight: bold;' : '';
    const isUsable = checkIsUsable(island);

    let html = `
        <div class="sticky-info-header">
            <h3>${name}</h3>
            ${isUsable ? `
            <div class="travel-info-box">
                <h4>🛳️ 가는 방법</h4>
                <p class="empty-info" style="font-size:0.9em; color:#555;">준비 중입니다.</p>
            </div>
            ` : ''}
        </div>
        
        <div class="info-row"><div class="info-label">소재지</div><div class="info-value">${address}</div></div>
        <div class="info-row">
            <div class="info-label">영해기점 무인도서 유무</div>
            <div class="info-value" style="${territorialStyle}">${territorialText}</div>
        </div>
        <div class="info-row"><div class="info-label">무인도서 관리유형</div><div class="info-value">${island.Column21 || '정보 없음'}</div></div>
        
        <div style="margin-top:15px;"></div>
        <div class="info-row"><div class="info-label">토지소유구분</div><div class="info-value">${island.Column9 || '정보 없음'}</div></div>
        <div class="info-row"><div class="info-label">관리번호</div><div class="info-value">${island.Column2 || '정보 없음'}</div></div>
        <div class="info-row"><div class="info-label">토지 소유자</div><div class="info-value">${island.Column10 || '정보 없음'}</div></div>
        <div class="info-row"><div class="info-label">토지 전체 면적(㎡)</div><div class="info-value">${island.Column11 ? island.Column11.toLocaleString() : '정보 없음'}</div></div>
        <div class="info-row"><div class="info-label">육지와의 거리(㎞)</div><div class="info-value">${island.Column16 !== undefined ? island.Column16 : '정보 없음'}</div></div>
        
        <div class="info-row horizontal">
            <div><div class="info-label">국유지</div><div class="info-value">${island.Column12 ? island.Column12.toLocaleString() : '-'}</div></div>
            <div><div class="info-label">공유지</div><div class="info-value">${island.Column13 ? island.Column13.toLocaleString() : '-'}</div></div>
            <div><div class="info-label">사유지</div><div class="info-value">${island.Column14 ? island.Column14.toLocaleString() : '-'}</div></div>
        </div>
        
        <div class="info-row"><div class="info-label">용도구분</div><div class="info-value">${island.Column18 || '정보 없음'}</div></div>
        <div class="info-row"><div class="info-label">지목</div><div class="info-value">${island.Column19 || '정보 없음'}</div></div>
        <div class="info-row"><div class="info-label">주변해역 관리유형</div><div class="info-value">${island.Column22 || '정보 없음'}</div></div>
        <div class="info-row"><div class="info-label">지정고시일</div><div class="info-value">${island.Column25 || '정보 없음'}</div></div>
    `;
    return html;
}

function initMap() {
    map = L.map('map', {zoomControl: false}).setView([37.5665, 126.9780], 10);
    currentLayer = mapStyles.satellite;
    currentLayer.addTo(map);

    markerClusterGroup = L.markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 50
    });
    map.addLayer(markerClusterGroup);

    usableClusterGroup = L.markerClusterGroup({
        showCoverageOnHover: false,
        maxClusterRadius: 50,
        iconCreateFunction: function(cluster) {
            const childCount = cluster.getChildCount();
            let c = 'marker-cluster-usable-';
            if (childCount < 10) c += 'small';
            else if (childCount < 100) c += 'medium';
            else c += 'large';
            return new L.DivIcon({
                html: '<div><span>' + childCount + '</span></div>',
                className: 'marker-cluster ' + c,
                iconSize: new L.Point(40, 40)
            });
        }
    });
    
    territorialLayer = L.layerGroup().addTo(map);
    portLayer = L.layerGroup().addTo(map);
}

async function loadIslands() {
    try {
        const response = await fetch('data00.json');
        const data = await response.json();
        const islands = Array.isArray(data) ? data.filter(i => i['무인도서 정보'] !== '무인도서명' && i.Column23 && i.Column24) : [];
        
        allIslands = islands;
        const validMarkers = [];

        islands.forEach(island => {
            const lat = dmsToDecimal(island.Column23);
            const lng = dmsToDecimal(island.Column24);
            if (lat && lng) {
                const marker = L.marker([lat, lng]);
                islandMarkers.set(marker, island);
                marker.bindTooltip(createTooltipContent(island), { permanent: false, direction: 'top', className: 'island-tooltip' });
                marker.on('click', () => showIslandDetails(island));
                validMarkers.push(marker);
            }
        });

        markers = validMarkers;
        markerClusterGroup.addLayers(validMarkers);
        console.log(`Loaded ${validMarkers.length} islands`);
    } catch (error) {
        console.error('Error:', error);
    }
}

async function loadPorts() {
    try {
        const response = await fetch('port.json');
        const ports = await response.json();
        ports.forEach(port => {
            const coords = port.경위도.split(',').map(c => parseFloat(c.trim()));
            const lat = coords[0];
            const lng = coords[1];
            if (lat && lng) {
                 const customIcon = L.divIcon({
                    className: 'port-marker-icon',
                    iconSize: [10, 10],
                    iconAnchor: [5, 5]
                });
                const marker = L.marker([lat, lng], { icon: customIcon });
                marker.bindTooltip(`<b>${port.이름}</b><br>${port.주소}`, { direction: 'top', className: 'island-tooltip' });
                portLayer.addLayer(marker);
            }
        });
        map.removeLayer(portLayer); 
    } catch (error) {
        console.error('Error loading ports:', error);
    }
}

function showIslandDetails(island) {
    const detailPanel = document.getElementById('detailPanel');
    const detailContainer = document.getElementById('detailContainer');
    detailContainer.innerHTML = createDetailContent(island);
    detailPanel.classList.remove('hidden');
    detailContainer.scrollTop = 0;
}

function toggleSearchPanel() {
    const searchPanel = document.getElementById('searchPanel');
    const openBtn = document.getElementById('openSearchPanelBtn');
    if (searchPanel.classList.contains('hidden')) {
        searchPanel.classList.remove('hidden');
        openBtn.classList.add('hidden');
    } else {
        searchPanel.classList.add('hidden');
        openBtn.classList.remove('hidden');
    }
}

function getIslandsByRegion(regionName) {
    if (!regionName) return allIslands;
    const regions = regionMapping[regionName] || [];
    return allIslands.filter(i => regions.some(r => (i.Column3 || '').includes(r)));
}

function highlightRegion(regionIslands) {
    if (regionPolygon) { map.removeLayer(regionPolygon); regionPolygon = null; }
    if (!regionIslands.length) return;

    const coords = [];
    regionIslands.forEach(i => {
        const lat = dmsToDecimal(i.Column23);
        const lng = dmsToDecimal(i.Column24);
        if (lat && lng) coords.push([lat, lng]);
    });
    if (!coords.length) return;

    let minLat = coords[0][0], maxLat = coords[0][0], minLng = coords[0][1], maxLng = coords[0][1];
    coords.forEach(c => {
        if (c[0] < minLat) minLat = c[0]; if (c[0] > maxLat) maxLat = c[0];
        if (c[1] < minLng) minLng = c[1]; if (c[1] > maxLng) maxLng = c[1];
    });

    const latPad = (maxLat - minLat) * 0.1, lngPad = (maxLng - minLng) * 0.1;
    const pCoords = [
        [minLat - latPad, minLng - lngPad],
        [maxLat + latPad, minLng - lngPad],
        [maxLat + latPad, maxLng + lngPad],
        [minLat - latPad, maxLng + lngPad]
    ];

    try {
        regionPolygon = L.polygon(pCoords, {
            color: '#ffffff', weight: 2, opacity: 1, fillColor: '#ffffff', fillOpacity: 0.0, lineJoin: 'round', className: 'region-highlight-polygon'
        }).addTo(map);
    } catch (e) { console.error(e); }
}

function clearRegionHighlight() {
    if (regionPolygon) { map.removeLayer(regionPolygon); regionPolygon = null; }
}

function getSigunguList(islands) {
    const map = new Map();
    islands.forEach(i => {
        if (i.Column4) {
            let full = i.Column4;
            if ((i.Column3 || '').match(/(광역시|특별시)/)) full = `${i.Column3} ${i.Column4}`;
            if (!map.has(i.Column4)) map.set(i.Column4, { short: i.Column4, full, sido: i.Column3 });
        }
    });
    return Array.from(map.values()).sort((a, b) => {
        if (a.sido !== b.sido) return a.sido.localeCompare(b.sido);
        return a.short.localeCompare(b.short);
    });
}

function updateSigunguSelect(islands) {
    const sel = document.getElementById('sigunguSelect');
    const list = getSigunguList(islands);
    if (!list.length) { sel.style.display = 'none'; sel.value = ''; return; }
    sel.style.display = 'block'; 
    sel.innerHTML = '<option value="">전체</option>' + list.map(s => `<option value="${s.short}">${s.full}</option>`).join('');
}

function renderPagination(container, totalItems, currentPage, onPageChange) {
    if (!container) return;
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
    if (totalPages <= 1) { container.innerHTML = ''; return; }
    let html = `
        <button class="page-btn prev" ${currentPage === 1 ? 'disabled' : ''}>&lt;</button>
        <span class="page-info">${currentPage} / ${totalPages}</span>
        <button class="page-btn next" ${currentPage === totalPages ? 'disabled' : ''}>&gt;</button>
    `;
    container.innerHTML = html;
    
    // 버튼 이벤트 연결은 DOMContentLoaded에서 수행
    const prevBtn = container.querySelector('.prev');
    const nextBtn = container.querySelector('.next');

    if (prevBtn) prevBtn.addEventListener('click', (e) => { e.stopPropagation(); if (currentPage > 1) onPageChange(currentPage - 1); });
    if (nextBtn) nextBtn.addEventListener('click', (e) => { e.stopPropagation(); if (currentPage < totalPages) onPageChange(currentPage + 1); });
}

function renderIslandList() {
    const list = document.getElementById('islandList');
    const pagContainer = document.getElementById('islandListPagination');
    if (!list) return;

    if (currentIslandListItems.length === 0) {
        list.innerHTML = '<p style="padding: 10px; color: #666; text-align: center;">해당하는 섬이 없습니다</p>';
        if (pagContainer) pagContainer.innerHTML = '';
        return;
    }

    const start = (islandListPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const pageItems = currentIslandListItems.slice(start, end);

    list.innerHTML = pageItems.map(i => `
        <div class="island-list-item" data-island-id="${i.Column2}">
            <div class="island-name">${i['무인도서 정보'] || '이름 없음'}</div>
            <div class="island-address">${formatAddress(i)}</div>
        </div>
    `).join('');

    list.querySelectorAll('.island-list-item').forEach(item => {
        item.addEventListener('click', function() {
            const islandId = this.dataset.islandId;
            const island = allIslands.find(i => i.Column2 === islandId);
            if (island) {
                showIslandDetails(island);
                const lat = dmsToDecimal(island.Column23);
                const lng = dmsToDecimal(island.Column24);
                if (lat && lng) map.flyTo([lat, lng], 15, { animate: true, duration: 1.0 });
            }
        });
    });

    renderPagination(pagContainer, currentIslandListItems.length, islandListPage, (newPage) => {
        islandListPage = newPage;
        renderIslandList();
    });
}

function updateIslandList(regionName, sigungu = '') {
    const header = document.querySelector('.island-list-header h4');
    let islands = getIslandsByRegion(regionName);

    const usableBtn = document.getElementById('usableToggleBtn');
    const isUsableActive = usableBtn && usableBtn.classList.contains('active');
    if (isUsableActive) islands = islands.filter(checkIsUsable);

    if (sigungu) islands = islands.filter(i => i.Column4 === sigungu);

    currentIslandListItems = islands;
    if (islandListPage > Math.ceil(islands.length / ITEMS_PER_PAGE)) islandListPage = 1;
    
    if (!regionName) {
        document.getElementById('sigunguSelect').style.display = 'none';
        if (header) header.textContent = '섬 목록';
        clearRegionHighlight();
        renderIslandList();
        return;
    }
    
    if (header) {
        if (sigungu) {
            const sObj = getSigunguList(getIslandsByRegion(regionName)).find(s => s.short === sigungu);
            header.textContent = `섬 목록 - ${sObj ? sObj.full : sigungu}`;
        } else {
            header.textContent = `섬 목록 - 전체`;
        }
    }

    renderIslandList();

    const markersToShow = markers.filter(m => {
        const i = islandMarkers.get(m);
        return islands.some(regionIsland => regionIsland.Column2 === i.Column2);
    });

    if (markersToShow.length > 0) {
        const bounds = L.latLngBounds(markersToShow.map(m => m.getLatLng()));
        map.fitBounds(bounds.pad(0.2));
        setTimeout(() => highlightRegion(islands), 500); 
    } else {
        clearRegionHighlight();
    }
}

function updateTerritorialListUI() {
    const listContent = document.getElementById('territorialListContent');
    const pagContainer = document.getElementById('territorialPagination');
    if (!listContent) return;
    const tIslands = allIslands.filter(i => checkIsTerritorial(i));
    const totalPages = Math.ceil(tIslands.length / ITEMS_PER_PAGE);
    if (territorialListPage > totalPages) territorialListPage = 1;
    const start = (territorialListPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const pageItems = tIslands.slice(start, end);
    let html = '';
    pageItems.forEach(island => {
        html += `
            <div class="t-list-item" data-island-id="${island.Column2}">
                <div class="t-name">${island['무인도서 정보']}</div>
                <div class="t-addr">${formatAddress(island)}</div>
            </div>
        `;
    });
    listContent.innerHTML = html;
    listContent.querySelectorAll('.t-list-item').forEach(item => {
        item.addEventListener('click', function() {
            const islandId = this.dataset.islandId;
            const island = allIslands.find(i => i.Column2 === islandId);
            if (island) {
                showIslandDetails(island);
                const lat = dmsToDecimal(island.Column23);
                const lng = dmsToDecimal(island.Column24);
                if (lat && lng) map.flyTo([lat, lng], 15, { animate: true, duration: 1.0 });
            }
        });
    });
    renderPagination(pagContainer, tIslands.length, territorialListPage, (newPage) => {
        territorialListPage = newPage;
        updateTerritorialListUI();
    });
}

function updateViewportList() {
    const box = document.getElementById('viewportListBox');
    const listContent = document.getElementById('viewportListContent');
    const pagContainer = document.getElementById('viewportPagination');
    if (box.classList.contains('hidden') || !listContent) return; 
    if (map.getZoom() < 10) {
        listContent.innerHTML = '<p style="padding:10px; color:#999;">지도를 더 확대하세요.</p>';
        document.getElementById('viewportCount').textContent = '현재 화면의 섬 (-)';
        if (pagContainer) pagContainer.innerHTML = '';
        return;
    }
    const bounds = map.getBounds();
    const usableBtn = document.getElementById('usableToggleBtn');
    const isUsableActive = usableBtn && usableBtn.classList.contains('active');
    
    let visibleIslands = allIslands.filter(island => {
        if (isUsableActive && !checkIsUsable(island)) return false;
        const lat = dmsToDecimal(island.Column23);
        const lng = dmsToDecimal(island.Column24);
        if (lat && lng) return bounds.contains([lat, lng]);
        return false;
    });

    currentViewportItems = visibleIslands;
    document.getElementById('viewportCount').textContent = `현재 화면의 섬 (${visibleIslands.length})`;

    const totalPages = Math.ceil(visibleIslands.length / ITEMS_PER_PAGE);
    if (viewportListPage > totalPages) viewportListPage = 1;
    
    const start = (viewportListPage - 1) * ITEMS_PER_PAGE;
    const end = start + ITEMS_PER_PAGE;
    const pageItems = visibleIslands.slice(start, end);

    let html = '';
    if (pageItems.length === 0) {
        html = '<p style="padding:10px; color:#999;">화면 내 섬이 없습니다.</p>';
    } else {
        pageItems.forEach(island => {
             html += `
                <div class="t-list-item" data-island-id="${island.Column2}">
                    <div class="t-name">${island['무인도서 정보']}</div>
                    <div class="t-addr">${formatAddress(island)}</div>
                </div>
            `;
        });
    }

    listContent.innerHTML = html;

    listContent.querySelectorAll('.t-list-item').forEach(item => {
        item.addEventListener('click', function() {
            const islandId = this.dataset.islandId;
            const island = allIslands.find(i => i.Column2 === islandId);
            if (island) {
                showIslandDetails(island);
                const lat = dmsToDecimal(island.Column23);
                const lng = dmsToDecimal(island.Column24);
                if (lat && lng) map.flyTo([lat, lng], 15, { animate: true, duration: 1.0 });
            }
        });
    });

    renderPagination(pagContainer, visibleIslands.length, viewportListPage, (newPage) => {
        viewportListPage = newPage;
        updateViewportList();
    });
}

function toggleSearchPanel() {
    const searchPanel = document.getElementById('searchPanel');
    const openBtn = document.getElementById('openSearchPanelBtn');
    if (searchPanel.classList.contains('hidden')) {
        searchPanel.classList.remove('hidden');
        openBtn.classList.add('hidden');
    } else {
        searchPanel.classList.add('hidden');
        openBtn.classList.remove('hidden');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initMap();
    loadIslands();
    loadPorts();

    document.getElementById('custom-zoom-in').onclick = (e) => { e.preventDefault(); map.zoomIn(); };
    document.getElementById('custom-zoom-out').onclick = (e) => { e.preventDefault(); map.zoomOut(); };
    document.getElementById('custom-zoom-korea').onclick = (e) => { 
        e.preventDefault(); 
        map.setView([36.5, 127.5], 7, { animate: true, duration: 1.0 });
        clearRegionHighlight();
        document.getElementById('regionSelect').value = "";
        document.getElementById('sigunguSelect').style.display = 'none';
        updateIslandList(""); 
    };

    const styleBtns = document.querySelectorAll('.style-btn');
    styleBtns.forEach(btn => {
        btn.onclick = function() {
            styleBtns.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
            if (mapStyles[this.dataset.style]) {
                map.removeLayer(currentLayer);
                currentLayer = mapStyles[this.dataset.style];
                currentLayer.addTo(map);
            }
        };
    });

    document.getElementById('toggleSearchPanelBtn').onclick = toggleSearchPanel;
    document.getElementById('openSearchPanelBtn').onclick = toggleSearchPanel;
    
    document.getElementById('toggleIslandList').onclick = function() {
        const list = document.getElementById('islandList');
        const pag = document.getElementById('islandListPagination');
        if (list.style.display === 'none') {
            list.style.display = 'block';
            pag.style.display = 'flex';
            this.textContent = '접기 ▲';
        } else {
            list.style.display = 'none';
            pag.style.display = 'none';
            this.textContent = '펼치기 ▼';
        }
    };

    const rSel = document.getElementById('regionSelect');
    const sSel = document.getElementById('sigunguSelect');
    rSel.onchange = function() {
        const regionIslands = getIslandsByRegion(this.value);
        updateSigunguSelect(regionIslands);
        islandListPage = 1;
        updateIslandList(this.value, '');
    };
    sSel.onchange = function() {
        islandListPage = 1;
        updateIslandList(rSel.value, this.value);
    };
    
    document.getElementById('closeDetailPanel').addEventListener('click', () => {
        document.getElementById('detailPanel').classList.add('hidden');
    });

    const territorialBtn = document.getElementById('territorialToggleBtn');
    const territorialListBox = document.getElementById('territorialListBox');
    const closeTerritorialList = document.getElementById('closeTerritorialList');
    let isTerritorialActive = false;

    if (territorialListBox) {
        L.DomEvent.disableScrollPropagation(territorialListBox);
        L.DomEvent.disableClickPropagation(territorialListBox);
    }

    territorialBtn.addEventListener('click', function() {
        isTerritorialActive = !isTerritorialActive;
        if (isTerritorialActive) {
            this.classList.add('active');
            territorialListPage = 1;
            updateTerritorialListUI();
            territorialListBox.classList.remove('hidden');
            territorialLayer.clearLayers();
            allIslands.forEach(island => {
                if (checkIsTerritorial(island)) {
                    const lat = dmsToDecimal(island.Column23);
                    const lng = dmsToDecimal(island.Column24);
                    if (lat && lng) {
                        const customIcon = L.divIcon({
                            className: 'territorial-marker-icon',
                            iconSize: [14, 14],
                            iconAnchor: [7, 7]
                        });
                        const marker = L.marker([lat, lng], { icon: customIcon });
                        marker.on('add', function() {
                            const el = this.getElement();
                            if (el) el.classList.add('territorial-highlight');
                        });
                        marker.bindTooltip(createTooltipContent(island), { permanent: false, direction: 'top', className: 'island-tooltip' });
                        marker.on('click', () => showIslandDetails(island));
                        territorialLayer.addLayer(marker);
                    }
                }
            });
        } else {
            this.classList.remove('active');
            territorialListBox.classList.add('hidden'); 
            territorialLayer.clearLayers();
        }
    });
    
    closeTerritorialList.addEventListener('click', () => {
        territorialListBox.classList.add('hidden');
    });

    const usableBtn = document.getElementById('usableToggleBtn');
    let isUsableActive = false;

    usableBtn.addEventListener('click', function() {
        isUsableActive = !isUsableActive;
        
        if (isUsableActive) {
            this.classList.add('active');
            map.removeLayer(markerClusterGroup);
            usableClusterGroup.clearLayers();
            const usableMarkers = [];
            allIslands.forEach(island => {
                if (checkIsUsable(island)) {
                    const lat = dmsToDecimal(island.Column23);
                    const lng = dmsToDecimal(island.Column24);
                    if (lat && lng) {
                        const customIcon = L.divIcon({
                            className: 'usable-marker-icon',
                            iconSize: [12, 12],
                            iconAnchor: [6, 6]
                        });
                        const marker = L.marker([lat, lng], { icon: customIcon });
                        marker.on('add', function() {
                            const el = this.getElement();
                            if (el) el.classList.add('usable-highlight');
                        });
                        marker.bindTooltip(createTooltipContent(island), { permanent: false, direction: 'top', className: 'island-tooltip' });
                        marker.on('click', () => showIslandDetails(island));
                        usableMarkers.push(marker);
                    }
                }
            });
            usableClusterGroup.addLayers(usableMarkers);
            map.addLayer(usableClusterGroup);
        } else {
            this.classList.remove('active');
            map.removeLayer(usableClusterGroup);
            map.addLayer(markerClusterGroup);
        }
        
        islandListPage = 1;
        updateIslandList(rSel.value, sSel.value);
        viewportListPage = 1;
        updateViewportList();
    });

    // 항구 버튼
    const portBtn = document.getElementById('portToggleBtn');
    let isPortActive = false;

    portBtn.addEventListener('click', function() {
        isPortActive = !isPortActive;
        if (isPortActive) {
            this.classList.add('active');
            map.addLayer(portLayer);
        } else {
            this.classList.remove('active');
            map.removeLayer(portLayer);
        }
    });

    const viewportListBox = document.getElementById('viewportListBox');
    const closeViewportList = document.getElementById('closeViewportList');

    if (viewportListBox) {
        L.DomEvent.disableScrollPropagation(viewportListBox);
        L.DomEvent.disableClickPropagation(viewportListBox);
    }

    map.on('moveend', function() {
        if (map.getZoom() >= 10 && !viewportListBox.classList.contains('closed-by-user')) {
            viewportListBox.classList.remove('hidden');
            updateViewportList();
        } else {
            viewportListBox.classList.add('hidden');
        }
    });

    closeViewportList.addEventListener('click', () => {
        viewportListBox.classList.add('hidden');
        viewportListBox.classList.add('closed-by-user');
    });
});