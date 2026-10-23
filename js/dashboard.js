(function (window, document) {
    'use strict';

    const API_PATH = '/api/v1/dashboard/overview';
    const byId = id => document.getElementById(id);
    const text = (id, value) => { byId(id).textContent = value == null ? '--' : String(value); };
    const node = (tag, value, className = '') => {
        const element = document.createElement(tag);
        element.className = className;
        if (value != null) element.textContent = String(value);
        return element;
    };
    let data = null;
    let chart = null;
    let map = null;
    let mapReady = false;
    let markers = [];
    let mapTimer;
    let requestNumber = 0;

    function status(state, message) {
        text('api-status', message);
        byId('api-status').dataset.state = state;
        byId('api-retry').hidden = state !== 'error';
        byId('api-retry').disabled = state === 'loading';
    }

    function clearMarkers() {
        markers.forEach(marker => {
            try { marker.setMap?.(null); } catch (_error) { /* Map disposal cannot block API data. */ }
        });
        markers = [];
    }

    function resetData() {
        data = null;
        [
            'metric-water', 'unit-water', 'metric-ndvi', 'metric-growth', 'unit-growth',
            'metric-oxygen', 'unit-oxygen', 'alerts-list', 'monitoring-sites',
            'detection-status', 'detection-label', 'detection-confidence', 'detection-model',
            'detection-media-status', 'status-satellite', 'status-load', 'status-cloud',
            'status-patrol', 'status-ai'
        ].forEach(id => text(id, '--'));
        byId('detection-image').hidden = true;
        byId('detection-image').removeAttribute('src');
        try { chart?.clear(); } catch (_error) { /* An unavailable SDK must not block the next request. */ }
        clearMarkers();
    }

    function renderAlerts(alerts) {
        const cards = alerts.map(alert => {
            const high = alert.severity === 'high';
            const card = node('div', null, high ? 'bg-red-500/10 border-l-2 border-red-500 p-3' : 'bg-orange-500/10 border-l-2 border-orange-500 p-3');
            const heading = node('div', null, `flex justify-between text-[10px] mb-1 ${high ? 'text-red-400' : 'text-orange-400'}`);
            heading.append(node('span', alert.title, 'font-bold'), node('span', alert.time));
            card.append(heading, node('p', `${alert.location} · ${alert.description}`, 'text-[10px] text-slate-300 leading-relaxed'));
            return card;
        });
        byId('alerts-list').replaceChildren(...cards);
        if (!cards.length) text('alerts-list', '暂无告警');
    }

    function renderSiteList(sites) {
        byId('monitoring-sites').replaceChildren(...sites.map(site => node('li',
            `${site.name} · ${site.latitude.toFixed(2)}°N, ${site.longitude.toFixed(2)}°E · ${site.description}`)));
    }

    function renderMarkers() {
        if (!mapReady || !data) return;
        try {
            clearMarkers();
            const sdk = window.AMap;
            data.monitoringSites.forEach(site => {
                const position = [site.longitude, site.latitude];
                const marker = new sdk.Marker({
                    position, content: node('div', null, 'red-pulse'),
                    offset: new sdk.Pixel(-15, -15), map
                });
                marker.on('click', () => {
                    try {
                        const card = node('div', null, 'degrade-card');
                        card.append(
                            node('div', site.name, 'title'),
                            node('div', `${site.latitude.toFixed(2)}°N, ${site.longitude.toFixed(2)}°E`, 'coord'),
                            node('div', site.description, 'desc')
                        );
                        new sdk.InfoWindow({ content: card, offset: new sdk.Pixel(0, -18) }).open(map, position);
                    } catch (_error) {
                        text('map-status', '地图信息窗不可用，请查看下方监测点信息。');
                    }
                });
                markers.push(marker);
            });
            text('map-status', `地图已加载 · ${data.monitoringSites.length} 个监测点`);
        } catch (_error) {
            clearMarkers();
            text('map-status', '地图点位不可用，请查看监测点列表；API 数据不受影响。');
        }
    }

    function initializeMap() {
        if (map) return;
        if (!window.AMap?.Map) {
            text('map-status', '地图服务不可用或未加载，请查看监测点列表。');
            return;
        }
        try {
            map = new window.AMap.Map('map-container', {
                viewMode: '2D', zoom: 7, center: [97.5, 34.0], pitch: 0,
                rotation: 0, mapStyle: 'amap://styles/green', terrain: true
            });
            text('map-status', '地图加载中；监测点列表可独立查看。');
            mapTimer = setTimeout(() => {
                if (!mapReady) text('map-status', '地图加载超时或不可用，请查看监测点列表。');
            }, 10000);
            map.on('complete', () => {
                clearTimeout(mapTimer);
                mapReady = true;
                text('map-status', '地图已加载，等待监测点数据。');
                renderMarkers();
            });
            map.on('error', () => {
                clearTimeout(mapTimer);
                text('map-status', '地图服务不可用，请查看监测点列表。');
            });
        } catch (_error) {
            clearTimeout(mapTimer);
            map = null;
            text('map-status', '地图服务不可用，请查看监测点列表；API 数据不受影响。');
        }
    }

    function renderWaterChart() {
        if (!window.echarts?.init) {
            text('water-chart-status', '图表服务不可用或未加载，其他指标仍可查看。');
            return;
        }
        if (!data) return;
        try {
            chart ||= window.echarts.init(byId('water-chart'));
            chart.setOption({
                backgroundColor: 'transparent',
                tooltip: { trigger: 'axis', renderMode: 'richText' },
                grid: { left: 0, right: 0, top: 10, bottom: 0 },
                xAxis: { type: 'category', data: data.waterTrend.labels, show: false },
                yAxis: { show: false },
                series: [{ type: 'bar', barWidth: '40%', data: data.waterTrend.values,
                    itemStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [{ offset: 0, color: '#29f5cf' }, { offset: 1, color: 'rgba(41,245,207,0.1)' }] } } }]
            }, true);
            text('water-chart-status', '');
        } catch (_error) {
            text('water-chart-status', '图表服务不可用，其他指标仍可查看。');
        }
    }

    function renderOverview(result) {
        const { metrics, systemStatus: system, latestDetection: detection } = result;
        // Access the fixed nested contract before marking a response successful.
        if (!metrics || !system || !detection || !Array.isArray(result.monitoringSites) ||
            !Array.isArray(result.alerts) || !Array.isArray(result.waterTrend?.values)) {
            throw new Error('服务返回的概览数据不完整。');
        }
        const metric = key => `${metrics[key].value}${metrics[key].qualifier || ''}`;
        text('metric-water', metric('waterRetention'));
        text('unit-water', metrics.waterRetention.unit);
        text('metric-ndvi', metric('ndvi'));
        text('metric-growth', metric('growthRate'));
        text('unit-growth', metrics.growthRate.unit);
        text('metric-oxygen', metric('negativeOxygenIons'));
        text('unit-oxygen', metrics.negativeOxygenIons.unit);
        renderAlerts(result.alerts);
        renderSiteList(result.monitoringSites);
        text('detection-label', detection.label);
        text('detection-confidence', `${(detection.confidence * 100).toFixed(0)}%`);
        text('detection-status', detection.modelStatus === 'demo' ? '就绪' : detection.modelStatus);
        text('detection-model', `${detection.modelName} ${detection.modelVersion}`);
        const image = byId('detection-image');
        // Only image resources on this application (or the configured API origin) are allowed.
        if (typeof detection.mediaUrl === 'string' && /^\/(?!\/)/.test(detection.mediaUrl)) {
            image.src = window.DemoAPI.assetUrl(detection.mediaUrl);
            image.alt = detection.label;
            image.hidden = false;
            text('detection-media-status', '');
        } else {
            text('detection-media-status', '图片地址不可用');
        }
        text('status-satellite', system.satellite);
        text('status-load', `${system.sensorLoadPercent}%`);
        text('status-cloud', system.cloudNode);
        text('status-patrol', `${system.patrolDistanceKm} KM`);
        text('status-ai', system.ai === 'demo' ? '运行中' : system.ai);
        data = result;
        renderWaterChart();
        renderMarkers();
    }

    async function loadOverview() {
        const current = ++requestNumber;
        resetData();
        status('loading', 'API 加载中…');
        try {
            const result = await window.DemoAPI.get(API_PATH);
            if (current !== requestNumber) return;
            renderOverview(result);
            status('success', `API 加载成功 · 更新时间 ${result.updatedAt}`);
        } catch (error) {
            if (current !== requestNumber) return;
            resetData();
            status('error', `API 加载失败：${error.message || '服务不可用'} 请重试。`);
        }
    }

    function icons() {
        try { window.lucide?.createIcons(); } catch (_error) { /* Icons are decorative, not a data dependency. */ }
    }
    byId('api-retry').addEventListener('click', loadOverview);
    byId('detection-image').addEventListener('error', () => {
        byId('detection-image').hidden = true;
        text('detection-media-status', '图片暂不可用；标签数据仍可查看。');
    });
    byId('charts-sdk')?.addEventListener('load', renderWaterChart);
    byId('charts-sdk')?.addEventListener('error', renderWaterChart);
    byId('map-sdk')?.addEventListener('load', initializeMap);
    byId('map-sdk')?.addEventListener('error', initializeMap);
    byId('icons-sdk')?.addEventListener('load', icons);
    window.addEventListener('resize', () => {
        try { chart?.resize(); } catch (_error) { text('water-chart-status', '图表服务不可用，其他指标仍可查看。'); }
        try { map?.resize(); } catch (_error) { text('map-status', '地图服务不可用，请查看监测点列表。'); }
    });
    const tickClock = () => text('clock', new Date().toLocaleString('zh-CN', { hour12: false }));
    tickClock();
    setInterval(tickClock, 1000);
    icons();
    initializeMap();
    renderWaterChart();
    loadOverview();
})(window, document);
