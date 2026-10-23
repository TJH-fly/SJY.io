(function (window, document) {
    'use strict';

    const byId = id => document.getElementById(id);
    const text = (id, value) => { byId(id).textContent = value == null ? '--' : String(value); };
    const node = (tag, value, className = '') => {
        const element = document.createElement(tag);
        element.className = className;
        if (value != null) element.textContent = String(value);
        return element;
    };
    const buttons = [...document.querySelectorAll('#scale-switch .seg-btn')];
    const number = value => Number.isFinite(value) ? value.toFixed(3) : '--';
    const rate = value => Number.isFinite(value) ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%` : '--';
    const rateClass = value => value > 0 ? 'tag-up' : value < 0 ? 'tag-down' : 'tag-flat';
    let data = null;
    let scale = 'month';
    let requestNumber = 0;
    let mainChart = null;
    let pieChart = null;

    function status(state, message) {
        text('api-status', message);
        byId('api-status').dataset.state = state;
        byId('api-retry').hidden = state !== 'error';
        byId('api-retry').disabled = state === 'loading';
        buttons.forEach(button => { button.disabled = state === 'loading'; });
    }

    function resetData() {
        data = null;
        [
            'kpi-meadow', 'kpi-steppe', 'kpi-meadow-trend', 'kpi-steppe-trend',
            'kpi-meadow-sub', 'kpi-steppe-sub', 'kpi-pred', 'kpi-pred-tag', 'kpi-pred-sub',
            'restoration-rate', 'restoration-area', 'degradation-list', 'table-note',
            'model-label', 'model-footer', 'model-status', 'calibration-points',
            'source-composition', 'scale-display', 'demo-disclaimer'
        ].forEach(id => text(id, '--'));
        ['kpi-meadow-trend', 'kpi-steppe-trend'].forEach(id => { byId(id).className = 'text-[10px] tag-flat'; });
        const row = node('tr');
        const cell = node('td', '--');
        cell.setAttribute('colspan', '6');
        row.append(cell);
        byId('table-body').replaceChildren(row);
        [mainChart, pieChart].forEach(chart => { try { chart?.clear(); } catch (_error) { /* SDKs never block data requests. */ } });
    }

    function renderTable(result) {
        const headers = ['时间', '草甸 NDVI', '草原 NDVI', `草甸${result.changeRateLabel}`, `草原${result.changeRateLabel}`, '数据性质'];
        const heading = node('tr');
        heading.append(...headers.map(label => node('th', label)));
        byId('table-head').replaceChildren(heading);
        const { meadow, steppe } = result.series;
        const rows = meadow.points.map((point, index) => {
            const grass = steppe.points[index];
            const row = node('tr');
            row.append(
                node('td', point.label), node('td', number(point.value)), node('td', number(grass.value)),
                node('td', rate(point.changeRate), rateClass(point.changeRate)),
                node('td', rate(grass.changeRate), rateClass(grass.changeRate))
            );
            const kind = node('td');
            kind.append(node('span', point.kind === 'forecast' ? '预测' : '实测', point.kind === 'forecast' ? 'badge-pred' : 'badge-real'));
            row.append(kind);
            return row;
        });
        byId('table-body').replaceChildren(...rows);
    }

    function lineSeries(series, color) {
        return [{
            name: series.name, type: 'line', smooth: true, symbol: 'circle', symbolSize: 5,
            data: series.points.map(point => point.kind === 'measured' ? point.value : null),
            lineStyle: { color, width: 2 }, itemStyle: { color }, areaStyle: { color, opacity: 0.08 },
            connectNulls: false
        }, {
            name: `${series.name}(预测)`, type: 'line', smooth: true, symbol: 'circle', symbolSize: 5,
            // Join the final measured point to the forecast, but never draw forecast points as measured.
            data: series.points.map((point, index, points) =>
                point.kind === 'forecast' || points[index + 1]?.kind === 'forecast' ? point.value : null),
            lineStyle: { color, width: 2, type: 'dashed' }, itemStyle: { color }, connectNulls: false
        }];
    }

    function renderCharts() {
        if (!window.echarts?.init) {
            text('main-chart-status', '图表服务不可用或未加载，指数明细表仍可查看。');
            text('pie-chart-status', '图表服务不可用或未加载，请查看退化等级明细。');
            return;
        }
        if (!data) return;
        const echarts = window.echarts;
        try {
            mainChart ||= echarts.init(byId('main-chart'));
            const series = [
                ...lineSeries(data.series.meadow, '#29f5cf'),
                ...lineSeries(data.series.steppe, '#38bdf8')
            ];
            if (data.labels[data.predictionStartsAt] != null) {
                series[1].markLine = { symbol: 'none', silent: true,
                    lineStyle: { type: 'dashed', color: '#a78bfa', opacity: 0.6 },
                    label: { formatter: '预测开始', color: '#a78bfa', fontSize: 10 },
                    data: [{ xAxis: data.labels[data.predictionStartsAt] }] };
            }
            mainChart.setOption({
                backgroundColor: 'transparent',
                tooltip: { trigger: 'axis', renderMode: 'richText', backgroundColor: '#061226', borderColor: '#29f5cf44', textStyle: { color: '#cbd5e1', fontSize: 11 } },
                legend: { bottom: 0, textStyle: { color: '#94a3b8', fontSize: 10 }, itemWidth: 18, itemHeight: 8 },
                grid: { left: 40, right: 20, top: 22, bottom: 40 },
                xAxis: { type: 'category', data: data.labels, boundaryGap: false,
                    axisLine: { lineStyle: { color: '#29f5cf33' } }, axisLabel: { color: '#94a3b8', fontSize: 10 }, axisTick: { show: false } },
                yAxis: { type: 'value', name: 'NDVI', min: 0, max: data.yMax,
                    nameTextStyle: { color: '#64748b', fontSize: 10 }, axisLabel: { color: '#64748b', fontSize: 10 },
                    splitLine: { lineStyle: { color: '#ffffff08', type: 'dashed' } } },
                series
            }, true);
            text('main-chart-status', '');
        } catch (_error) {
            text('main-chart-status', '图表服务不可用，指数明细表仍可查看。');
        }
        try {
            pieChart ||= echarts.init(byId('pie-chart'));
            pieChart.setOption({
                backgroundColor: 'transparent', color: ['#29f5cf', '#38bdf8', '#fbbf24', '#fb923c', '#ff4d4f'],
                tooltip: { trigger: 'item', renderMode: 'richText', backgroundColor: '#061226', textStyle: { color: '#cbd5e1', fontSize: 11 } },
                legend: { bottom: 0, textStyle: { color: '#94a3b8', fontSize: 10 }, itemWidth: 8, itemHeight: 8, itemGap: 10 },
                series: [{ type: 'pie', radius: ['42%', '68%'], center: ['50%', '43%'],
                    label: { color: '#cbd5e1', fontSize: 10, formatter: '{d}%' },
                    itemStyle: { borderColor: '#061226', borderWidth: 2 },
                    data: data.degradation.map(item => ({ name: item.name, value: item.value })) }]
            }, true);
            text('pie-chart-status', '');
        } catch (_error) {
            text('pie-chart-status', '图表服务不可用，请查看退化等级明细。');
        }
    }

    function renderAnalytics(result) {
        if (result.scale !== scale || !result.series?.meadow || !result.series?.steppe ||
            !Array.isArray(result.labels) || !result.labels.length || !Array.isArray(result.degradation) ||
            !result.source || !result.model || !result.restoration) {
            throw new Error('服务返回的植被数据不完整或时间粒度不一致。');
        }
        for (const series of [result.series.meadow, result.series.steppe]) {
            if (!Number.isFinite(series.average) || !Number.isFinite(series.terminalForecast) ||
                !Array.isArray(series.points) || series.points.length !== result.labels.length ||
                series.points.some(point => !Number.isFinite(point.value) || !['measured', 'forecast'].includes(point.kind))) {
                throw new Error('服务返回的植被序列格式不正确。');
            }
        }
        const { meadow, steppe } = result.series;
        for (const [key, series] of [['meadow', meadow], ['steppe', steppe]]) {
            text(`kpi-${key}`, number(series.average));
            text(`kpi-${key}-sub`, `${series.name} · 全序列均值（含预测）`);
            text(`kpi-${key}-trend`, `期末${result.changeRateLabel} ${rate(series.changeRate)}`);
            byId(`kpi-${key}-trend`).className = `text-[10px] ${rateClass(series.changeRate)}`;
        }
        text('kpi-pred', number(meadow.terminalForecast));
        text('kpi-pred-tag', result.labels.at(-1));
        text('kpi-pred-sub', `草原期末预测 ${number(steppe.terminalForecast)}`);
        text('restoration-rate', result.restoration.rate);
        text('restoration-area', `累计修复面积 ${result.restoration.area} ${result.restoration.areaUnit}`);
        byId('degradation-list').replaceChildren(...result.degradation.map(item => node('li', `${item.name} ${item.value}%`)));
        renderTable(result);
        text('table-note', `数据来源：${result.source.name} · ${result.source.composition} · ${result.changeRateLabel}`);
        const modelName = `${result.model.name} v${result.model.version}`;
        text('model-label', modelName);
        text('model-footer', modelName);
        text('model-status', `${result.model.status === 'demo' ? '演示模型' : result.model.status} · ${result.model.inference ? '推理结果' : '非真实推理'}`);
        text('calibration-points', result.source.calibrationPoints);
        text('source-composition', result.source.composition);
        text('scale-display', result.scale === 'month' ? `月度（${result.unitLabel}）` : `年度（${result.unitLabel}）`);
        text('demo-disclaimer', `${result.isDemo || result.source.isDemo ? '演示数据 · ' : ''}${result.disclaimer}`);
        data = result;
        renderCharts();
    }

    async function loadScale(nextScale) {
        const current = ++requestNumber;
        scale = nextScale;
        buttons.forEach(button => {
            const active = button.dataset.scale === scale;
            button.classList.toggle('active', active);
            button.setAttribute('aria-pressed', String(active));
        });
        resetData();
        status('loading', `API 加载中…（${scale === 'month' ? '月度' : '年度'}）`);
        try {
            const result = await window.DemoAPI.get(`/api/v1/vegetation/analytics?scale=${encodeURIComponent(scale)}`);
            if (current !== requestNumber) return;
            renderAnalytics(result);
            status('success', `API 加载成功 · 更新时间 ${result.updatedAt}`);
        } catch (error) {
            if (current !== requestNumber) return;
            resetData();
            status('error', `API 加载失败：${error.message || '服务不可用'} 请重试。`);
        }
    }

    function icons() {
        try { window.lucide?.createIcons(); } catch (_error) { /* Decorative icons are optional. */ }
    }
    buttons.forEach(button => button.addEventListener('click', () => loadScale(button.dataset.scale)));
    byId('api-retry').addEventListener('click', () => loadScale(scale));
    byId('charts-sdk')?.addEventListener('load', renderCharts);
    byId('charts-sdk')?.addEventListener('error', renderCharts);
    byId('icons-sdk')?.addEventListener('load', icons);
    window.addEventListener('resize', () => {
        for (const [chart, id] of [[mainChart, 'main-chart-status'], [pieChart, 'pie-chart-status']]) {
            try { chart?.resize(); } catch (_error) { text(id, '图表服务不可用，明细数据仍可查看。'); }
        }
    });
    const tickClock = () => text('clock', new Date().toLocaleString('zh-CN', { hour12: false }));
    tickClock();
    setInterval(tickClock, 1000);
    icons();
    renderCharts();
    loadScale('month');
})(window, document);
