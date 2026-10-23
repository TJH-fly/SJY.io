(function (window) {
    'use strict';

    const document = window.document;
    const API = '/api/v1/admin';
    const RESOURCES = {
        site: { path: 'sites', label: '监测点', columns: 4, fields: ['name', 'longitude', 'latitude', 'description'] },
        alert: { path: 'alerts', label: '预警', columns: 6, fields: ['severity', 'title', 'time', 'location', 'description'] }
    };
    const PLACEHOLDERS = [
        'metric-modules', 'metric-sites', 'metric-alerts', 'metric-write',
        'count-modules', 'count-sites', 'count-alerts', 'count-vegetation', 'count-grades',
        'data-mode', 'write-enabled', 'admin-updated', 'admin-version-detail', 'admin-version'
    ];
    const STORE = { site: [], alert: [], user: [] };
    const EDITING = { site: null, alert: null, user: null };
    let requestNumber = 0;
    let auditToken = 0;
    let loading = false;
    let writing = false;
    let canWrite = false;
    let role = 'viewer';
    let user = null;
    let actionButtons = [];
    let userButtons = [];
    let auditPage = 1;
    let auditTotalPages = 1;

    function node(id) {
        return document.getElementById(id);
    }

    function text(id, value) {
        const element = node(id);
        if (element) element.textContent = value;
    }

    function setStatus(state, message) {
        const status = node('api-status');
        if (status) {
            status.dataset.state = state;
            status.textContent = message;
        }
        const retry = node('api-retry');
        if (retry) retry.hidden = state !== 'error';
    }

    function operation(kind, state, message) {
        const target = kind === 'user' ? 'users-status' : kind === 'image' ? 'image-status' : kind === 'confidence' ? 'detection-confidence-status' : kind === 'audit' ? 'audit-status' : `${RESOURCES[kind].path}-status`;
        const element = node(target);
        if (element) {
            element.dataset.state = state;
            element.textContent = message;
        }
    }

    function setControls() {
        const busy = loading || writing;
        for (const id of ['admin-refresh', 'api-retry']) if (node(id)) node(id).disabled = busy;
        if (node('site-submit')) node('site-submit').disabled = busy || !canWrite;
        if (node('alert-submit')) node('alert-submit').disabled = busy || !canWrite;
        if (node('image-submit')) node('image-submit').disabled = busy || !canWrite;
        if (node('image-reset')) node('image-reset').disabled = busy;
        if (node('detection-confidence-save')) node('detection-confidence-save').disabled = busy || !canWrite;
        if (node('user-submit')) node('user-submit').disabled = busy || role !== 'admin';
        for (const id of ['site-cancel', 'alert-cancel', 'user-cancel']) if (node(id)) node(id).disabled = busy;
        for (const button of actionButtons) button.disabled = busy || !canWrite;
        for (const button of userButtons) button.disabled = busy || role !== 'admin';
    }

    function tableMessage(id, columns, message) {
        const body = node(id);
        if (!body) return;
        const row = document.createElement('tr');
        const cell = document.createElement('td');
        cell.setAttribute('colspan', columns);
        cell.className = 'py-3 text-slate-500';
        cell.textContent = message;
        row.append(cell);
        body.replaceChildren(row);
    }

    function reset() {
        actionButtons = [];
        userButtons = [];
        STORE.site = [];
        STORE.alert = [];
        for (const id of PLACEHOLDERS) text(id, '--');
        text('admin-modules', '--');
        tableMessage('admin-table-body', 5, '--');
        for (const config of Object.values(RESOURCES)) tableMessage(`${config.path}-table-body`, config.columns, '--');
    }

    function count(value) {
        return Number.isFinite(value) ? String(value) : '--';
    }

    function cell(value) {
        const element = document.createElement('td');
        element.textContent = String(value ?? '--');
        return element;
    }

    function button(label, className, handler) {
        const element = document.createElement('button');
        element.type = 'button';
        element.className = `manage-button${className ? ` ${className}` : ''}`;
        element.textContent = label;
        element.addEventListener('click', handler);
        element.disabled = loading || writing || !canWrite;
        actionButtons.push(element);
        return element;
    }

    function setEndpoint(link, value) {
        if (typeof value === 'string' && /^\/(?!\/)[^\\\s]*$/.test(value)) {
            link.setAttribute('href', value);
            link.setAttribute('target', '_blank');
            link.setAttribute('rel', 'noopener');
        }
        link.textContent = value;
    }

    function moduleCard(module) {
        const card = document.createElement('article');
        card.className = 'module-card p-3';
        const heading = document.createElement('div');
        heading.className = 'flex items-center justify-between';
        const name = document.createElement('h3');
        name.className = 'text-sm font-bold text-white';
        name.textContent = module.name;
        const badge = document.createElement('span');
        badge.className = 'text-[10px] text-green-300 flex items-center gap-1';
        const dot = document.createElement('span');
        dot.className = 'status-dot';
        const label = document.createElement('span');
        label.textContent = module.status === 'ready' ? '就绪' : String(module.status);
        badge.append(dot, label);
        heading.append(name, badge);
        const description = document.createElement('p');
        description.className = 'text-[11px] muted mt-2 leading-relaxed';
        description.textContent = module.description;
        const endpoint = document.createElement('a');
        endpoint.className = 'endpoint text-[11px] text-green-300/90 mt-2 inline-block break-all';
        setEndpoint(endpoint, module.endpoint);
        const key = document.createElement('p');
        key.className = 'text-[10px] text-slate-500 mt-1';
        key.textContent = `key: ${module.key}`;
        card.append(heading, description, endpoint, key);
        return card;
    }

    function moduleRow(module) {
        const row = document.createElement('tr');
        row.className = 'border-b border-white/5';
        const name = cell(module.name);
        name.className = 'py-2 pr-4 text-slate-200';
        const key = cell(module.key);
        key.className = 'py-2 pr-4 value-mono text-slate-400';
        const status = cell(module.status === 'ready' ? '就绪' : module.status);
        status.className = 'py-2 pr-4 text-green-300';
        const endpointCell = cell('');
        endpointCell.className = 'py-2 pr-4';
        const link = document.createElement('a');
        link.className = 'endpoint text-green-300/90';
        setEndpoint(link, module.endpoint);
        endpointCell.append(link);
        const description = cell(module.description);
        description.className = 'py-2 muted';
        row.append(name, key, status, endpointCell, description);
        return row;
    }

    function clearForm(kind) {
        EDITING[kind] = null;
        if (kind === 'user') {
            for (const [id, value] of [['user-username', ''], ['user-password', ''], ['user-role', 'viewer'], ['user-version', ''], ['user-id', '']]) if (node(id)) node(id).value = value;
            if (node('user-username')) node('user-username').disabled = false;
            text('user-form-title', '新增账号');
            text('user-submit', '新增账号');
            if (node('user-cancel')) node('user-cancel').hidden = true;
            return;
        }
        const config = RESOURCES[kind];
        for (const field of config.fields) {
            const input = node(`${kind}-${field}`);
            if (input) input.value = field === 'severity' ? 'high' : '';
        }
        const version = node(`${kind}-version`);
        if (version) version.value = '';
        text(`${kind}-form-title`, `新增${config.label}`);
        text(`${kind}-submit`, `新增${config.label}`);
        if (node(`${kind}-cancel`)) node(`${kind}-cancel`).hidden = true;
    }

    function editRecord(kind, record) {
        if (loading || writing || !canWrite) return;
        EDITING[kind] = record;
        for (const field of RESOURCES[kind].fields) node(`${kind}-${field}`).value = String(record[field]);
        node(`${kind}-version`).value = String(record.version ?? '');
        text(`${kind}-form-title`, `编辑${RESOURCES[kind].label} #${record.id}`);
        text(`${kind}-submit`, '保存修改');
        node(`${kind}-cancel`).hidden = false;
        operation(kind, 'idle', `正在编辑 #${record.id}，保存后生效。`);
    }

    function editUser(record) {
        if (loading || writing || role !== 'admin') return;
        EDITING.user = record;
        node('user-id').value = String(record.id);
        node('user-username').value = record.username;
        node('user-username').disabled = true;
        node('user-password').value = '';
        node('user-role').value = record.role;
        node('user-version').value = String(record.version ?? '');
        text('user-form-title', `编辑账号：${record.username}`);
        text('user-submit', '保存修改');
        node('user-cancel').hidden = false;
        operation('user', 'idle', `正在编辑 ${record.username}，密码留空表示不修改。`);
    }

    function recordRow(kind, record) {
        const config = RESOURCES[kind];
        const row = document.createElement('tr');
        if (record.deletedAt) row.className = 'deleted-row';
        if (kind === 'site') {
            const name = cell(record.name);
            if (record.deletedAt) {
                const tag = document.createElement('span');
                tag.className = 'deleted-tag';
                tag.textContent = ' · 已删除';
                name.append(tag);
            }
            row.append(name, cell(`${record.longitude} / ${record.latitude}`), cell(record.description));
        } else {
            const title = cell(record.title);
            if (record.deletedAt) {
                const tag = document.createElement('span');
                tag.className = 'deleted-tag';
                tag.textContent = ' · 已删除';
                title.append(tag);
            }
            row.append(cell(record.severity === 'high' ? '高风险（high）' : '中风险（medium）'), title, cell(record.time), cell(record.location), cell(record.description));
        }
        const actions = cell('');
        const wrap = document.createElement('div');
        wrap.className = 'row-actions';
        if (record.deletedAt) {
            wrap.append(button('恢复', '', () => restoreRecord(kind, record)));
        } else if (role !== 'viewer') {
            wrap.append(button('编辑', '', () => editRecord(kind, record)), button('删除', 'danger', () => deleteRecord(kind, record)));
        }
        actions.append(wrap);
        row.append(actions);
        return row;
    }

    function renderRecords(kind, items) {
        const config = RESOURCES[kind];
        STORE[kind] = items;
        if (!items.length) {
            tableMessage(`${config.path}-table-body`, config.columns, `暂无${config.label}，可使用上方表单新增。`);
            return;
        }
        node(`${config.path}-table-body`).replaceChildren(...items.map(record => recordRow(kind, record)));
    }

    function formBody(kind) {
        const body = {};
        for (const field of RESOURCES[kind].fields) {
            const value = node(`${kind}-${field}`).value;
            body[field] = field === 'longitude' || field === 'latitude' ? (value.trim() ? Number(value) : NaN) : value;
        }
        return body;
    }

    function send(method, path, body) {
        return body === undefined
            ? window.DemoAPI.request(method, path)
            : window.DemoAPI.request(method, path, { json: body });
    }

    async function reload() {
        const ok = await loadAll();
        return ok;
    }

    async function saveRecord(kind) {
        if (loading || writing || !canWrite) return;
        const record = EDITING[kind];
        const method = record ? 'PUT' : 'POST';
        const body = formBody(kind);
        if (record) body.version = Number(node(`${kind}-version`).value);
        const path = `${API}/${RESOURCES[kind].path}${record ? `/${record.id}` : ''}`;
        writing = true;
        setControls();
        operation(kind, 'loading', record ? '保存中…' : '新增中…');
        try {
            await send(method, path, body);
            const label = record ? '保存' : '新增';
            clearForm(kind);
            operation(kind, 'loading', `${label}已成功，正在刷新数据…`);
            const ok = await reload();
            operation(kind, ok ? 'success' : 'error', ok ? `${label}成功，数据已刷新。` : `${label}已成功，但数据刷新失败。请刷新数据，不要重复提交。`);
        } catch (error) {
            if (error?.status === 409) {
                await reload();
                const latest = STORE[kind].find(item => item.id === record?.id);
                if (latest) node(`${kind}-version`).value = String(latest.version);
                operation(kind, 'error', '记录已被修改，已刷新为最新版本；请确认后重新保存。');
            } else {
                operation(kind, 'error', `保存失败：${error?.message || '无法连接服务，请检查网络。'}`);
            }
        } finally {
            writing = false;
            setControls();
        }
    }

    async function deleteRecord(kind, record) {
        if (loading || writing || !canWrite) return;
        if (!window.confirm(`确认删除${RESOURCES[kind].label}“${record.name || record.title}”？删除后可在“显示已删除”中恢复。`)) return;
        writing = true;
        setControls();
        operation(kind, 'loading', '删除中…');
        try {
            await send('DELETE', `${API}/${RESOURCES[kind].path}/${record.id}`);
            clearForm(kind);
            const ok = await reload();
            operation(kind, ok ? 'success' : 'error', ok ? '删除成功，数据已刷新。' : '删除已成功，但数据刷新失败。请刷新数据。');
        } catch (error) {
            operation(kind, 'error', `删除失败：${error?.message || '无法连接服务，请检查网络。'}`);
        } finally {
            writing = false;
            setControls();
        }
    }

    async function restoreRecord(kind, record) {
        if (loading || writing || !canWrite) return;
        writing = true;
        setControls();
        operation(kind, 'loading', '恢复中…');
        try {
            await send('POST', `${API}/${RESOURCES[kind].path}/${record.id}/restore`);
            const ok = await reload();
            operation(kind, ok ? 'success' : 'error', ok ? '已恢复，数据已刷新。' : '恢复成功，但数据刷新失败。请刷新数据。');
        } catch (error) {
            operation(kind, 'error', `恢复失败：${error?.message || '无法连接服务，请检查网络。'}`);
        } finally {
            writing = false;
            setControls();
        }
    }

    function validate(overview, sites, alerts) {
        if (!overview || !Array.isArray(overview.modules) || !overview.counts || typeof overview.writeEnabled !== 'boolean') throw new Error('后台数据格式不正确');
        for (const [kind, result] of [['site', sites], ['alert', alerts]]) {
            if (!Array.isArray(result?.items) || result.items.some(record => !record || !Number.isInteger(record.id) || record.id <= 0 || RESOURCES[kind].fields.some(field => record[field] === undefined))) {
                throw new Error(`${RESOURCES[kind].label}数据格式不正确`);
            }
        }
    }

    function render(overview) {
        text('metric-modules', count(overview.modules.length));
        text('metric-sites', count(overview.counts.monitoringSites));
        text('metric-alerts', count(overview.counts.alerts));
        text('metric-write', overview.writeEnabled ? '可写' : '只读');
        text('count-modules', count(overview.modules.length));
        text('count-sites', count(overview.counts.monitoringSites));
        text('count-alerts', count(overview.counts.alerts));
        text('count-vegetation', count(overview.counts.vegetationPoints));
        text('count-grades', count(overview.counts.degradationGrades));
        text('data-mode', overview.dataMode === 'sqlite' ? 'SQLite 本机持久化' : String(overview.dataMode || '--'));
        text('write-enabled', overview.writeEnabled ? '启用' : '关闭（只读）');
        text('admin-version', String(overview.version || '--'));
        text('admin-version-detail', String(overview.version || '--'));
        text('admin-updated', String(overview.updatedAt || '--'));
        if (overview.detectionImageUrl && node('image-preview')) {
            node('image-preview').src = window.DemoAPI.assetUrl(overview.detectionImageUrl);
            text('image-source', String(overview.detectionImageUrl).startsWith('/uploads/') ? `上传图片：${overview.detectionImageUrl}` : '默认图片');
        }
        const confidence = Number(overview.detectionConfidencePercent);
        if (Number.isInteger(confidence) && node('detection-confidence')) node('detection-confidence').value = String(confidence);
        const modules = node('admin-modules');
        const body = node('admin-table-body');
        if (modules) modules.replaceChildren();
        if (body) body.replaceChildren();
        for (const module of overview.modules) {
            if (modules) modules.append(moduleCard(module));
            if (body) body.append(moduleRow(module));
        }
    }

    function includePath(kind) {
        const checked = node(`${kind}s-include-deleted`)?.checked;
        return `${API}/${RESOURCES[kind].path}${checked ? '?includeDeleted=true' : ''}`;
    }

    async function loadAll() {
        const current = ++requestNumber;
        loading = true;
        setStatus('loading', '后台数据加载中…');
        reset();
        setControls();
        try {
            const [overview, sites, alerts] = await Promise.all([
                window.DemoAPI.get(`${API}/overview`),
                window.DemoAPI.get(includePath('site')),
                window.DemoAPI.get(includePath('alert'))
            ]);
            if (current !== requestNumber) return false;
            validate(overview, sites, alerts);
            render(overview);
            renderRecords('site', sites.items);
            renderRecords('alert', alerts.items);
            canWrite = role !== 'viewer' && overview.writeEnabled === true;
            setStatus('success', `后台数据加载成功 · 更新时间 ${overview.updatedAt || '--'}`);
            return true;
        } catch (error) {
            if (current !== requestNumber) return false;
            canWrite = false;
            reset();
            setStatus('error', `${error?.message || '后台数据加载失败。'} 请重试。`);
            return false;
        } finally {
            if (current === requestNumber) {
                loading = false;
                setControls();
            }
        }
    }

    function roleLabel(value) {
        return { viewer: '查看者', editor: '编辑者', admin: '管理员' }[value] || String(value);
    }

    function userRow(record) {
        const row = document.createElement('tr');
        row.append(cell(record.username), cell(roleLabel(record.role)), cell(record.isActive ? '启用' : '禁用'), cell(record.version));
        const actions = cell('');
        const wrap = document.createElement('div');
        wrap.className = 'row-actions';
        const edit = document.createElement('button');
        edit.type = 'button';
        edit.className = 'manage-button';
        edit.textContent = '编辑';
        edit.addEventListener('click', () => editUser(record));
        userButtons.push(edit);
        wrap.append(edit);
        actions.append(wrap);
        row.append(actions);
        return row;
    }

    function renderUsers(data) {
        STORE.user = data.items;
        if (!data.items.length) {
            tableMessage('users-table-body', 5, '暂无账号。');
            return;
        }
        node('users-table-body').replaceChildren(...data.items.map(userRow));
        setControls();
    }

    async function loadUsers(page = 1) {
        if (role !== 'admin') return;
        try {
            const data = await window.DemoAPI.get(`${API}/users?page=${page}&pageSize=20`);
            renderUsers(data);
        } catch (error) {
            operation('user', 'error', `账号读取失败：${error?.message || '无法连接服务'}`);
        }
    }

    async function saveUser() {
        if (loading || writing || role !== 'admin') return;
        const record = EDITING.user;
        const password = node('user-password').value;
        const body = { role: node('user-role').value, ...(password ? { password } : {}) };
        let method = 'POST';
        let path = `${API}/users`;
        if (record) {
            method = 'PUT';
            path = `${API}/users/${record.id}`;
            body.version = Number(node('user-version').value);
        } else {
            body.username = node('user-username').value;
            body.password = password;
        }
        writing = true;
        setControls();
        operation('user', 'loading', record ? '保存中…' : '创建中…');
        try {
            await send(method, path, body);
            clearForm('user');
            await loadUsers(1);
            operation('user', 'success', record ? '账号已更新。' : '账号已创建。');
        } catch (error) {
            operation('user', 'error', `保存失败：${error?.message || '无法连接服务，请检查网络。'}`);
        } finally {
            writing = false;
            setControls();
        }
    }

    function auditRow(record) {
        const row = document.createElement('tr');
        row.append(cell(record.at), cell(record.actorName), cell(record.action), cell(`${record.entityType}${record.entityId === null || record.entityId === undefined ? '' : ` #${record.entityId}`}`), cell(record.summary), cell(record.requestId));
        return row;
    }

    function renderAudit(data) {
        auditPage = data.page;
        auditTotalPages = data.totalPages;
        node('audit-pagination').textContent = `第 ${data.page} / ${data.totalPages} 页 · 共 ${data.total} 条`;
        if (node('audit-prev')) node('audit-prev').disabled = data.page <= 1;
        if (node('audit-next')) node('audit-next').disabled = data.page >= data.totalPages;
        if (!data.items.length) {
            tableMessage('audit-table-body', 6, '暂无审计记录。');
            return;
        }
        node('audit-table-body').replaceChildren(...data.items.map(auditRow));
    }

    async function loadAudit(page = auditPage) {
        if (role !== 'admin') return;
        const current = ++auditToken;
        operation('audit', 'loading', '审计日志加载中…');
        try {
            const data = await window.DemoAPI.get(`${API}/audit?page=${page}&pageSize=20`);
            if (current !== auditToken) return;
            renderAudit(data);
            operation('audit', 'idle', '');
        } catch (error) {
            if (current !== auditToken) return;
            operation('audit', 'error', `审计日志加载失败：${error?.message || '无法连接服务'}`);
        }
    }

    async function uploadImage(event) {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        if (loading || writing || !canWrite) return;
        const file = node('image-file')?.files?.[0];
        if (!file) {
            operation('image', 'error', '请选择一张图片。');
            return;
        }
        const form = new window.FormData();
        form.append('file', file);
        writing = true;
        setControls();
        operation('image', 'loading', '上传中…');
        try {
            const data = await window.DemoAPI.request('POST', `${API}/detection-image`, { body: form });
            if (node('image-preview')) node('image-preview').src = window.DemoAPI.assetUrl(data.url);
            text('image-source', `上传图片：${data.url}`);
            operation('image', 'success', '图片已更新，概览页将使用新图片。');
        } catch (error) {
            operation('image', 'error', `上传失败：${error?.message || '无法连接服务，请检查网络。'}`);
        } finally {
            writing = false;
            setControls();
        }
    }

    async function saveDetectionConfidence() {
        if (loading || writing || !canWrite) return;
        const input = node('detection-confidence');
        const percent = Number(input?.value);
        if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
            operation('confidence', 'error', '识别置信度必须是 1–100 的整数。');
            return;
        }
        writing = true;
        setControls();
        operation('confidence', 'loading', '保存识别置信度中…');
        try {
            const data = await window.DemoAPI.request('PUT', `${API}/settings/detection-confidence`, { json: { confidencePercent: percent } });
            if (data && Number.isInteger(Number(data.confidencePercent)) && input) input.value = String(data.confidencePercent);
            operation('confidence', 'success', `识别置信度已更新为 ${data?.confidencePercent ?? percent}%。`);
        } catch (error) {
            operation('confidence', 'error', `识别置信度保存失败：${error?.message || '无法连接服务，请检查网络。'}`);
        } finally {
            writing = false;
            setControls();
        }
    }

    async function resetImage() {
        if (loading || writing || !canWrite) return;
        writing = true;
        setControls();
        operation('image', 'loading', '恢复默认图片中…');
        try {
            await window.DemoAPI.request('DELETE', `${API}/detection-image`);
            if (node('image-preview')) node('image-preview').src = window.DemoAPI.assetUrl('/img/植物1.jpg');
            text('image-source', '默认图片');
            operation('image', 'success', '已恢复默认图片。');
        } catch (error) {
            operation('image', 'error', `恢复失败：${error?.message || '无法连接服务，请检查网络。'}`);
        } finally {
            writing = false;
            setControls();
        }
    }

    function applyRole() {
        const viewer = role === 'viewer';
        for (const id of ['site-form', 'alert-form', 'image-write-controls', 'sites-deleted-control', 'alerts-deleted-control']) if (node(id)) node(id).hidden = viewer;
        for (const id of ['users-panel', 'audit-panel']) if (node(id)) node(id).hidden = role !== 'admin';
        text('current-user', user ? `${user.username} · ${roleLabel(user.role)}（${user.role}）` : '--');
    }

    async function logout() {
        if (loading || writing) return;
        try {
            await window.DemoAPI.request('POST', '/api/v1/auth/logout');
            window.DemoAPI.clearToken();
            window.location.replace('./login.html');
        } catch (error) {
            setStatus('error', `退出登录失败：${error?.message || '无法连接服务'}`);
        }
    }

    function tick() {
        text('clock', new Date().toLocaleString('zh-CN', { hour12: false }));
    }

    function bind() {
        for (const id of ['api-retry', 'admin-refresh']) if (node(id)) node(id).addEventListener('click', () => { if (!writing) return loadAll(); });
        for (const kind of Object.keys(RESOURCES)) {
            clearForm(kind);
            node(`${kind}-form`).addEventListener('submit', event => {
                event.preventDefault();
                return saveRecord(kind);
            });
            node(`${kind}-cancel`).addEventListener('click', () => {
                if (loading || writing) return;
                clearForm(kind);
                operation(kind, 'idle', '已取消编辑。');
            });
            const filter = node(`${kind}s-include-deleted`);
            if (filter) filter.addEventListener('change', () => { if (!writing) return loadAll(); });
        }
        if (node('image-form')) node('image-form').addEventListener('submit', uploadImage);
        if (node('image-reset')) node('image-reset').addEventListener('click', resetImage);
        if (node('detection-confidence-save')) node('detection-confidence-save').addEventListener('click', saveDetectionConfidence);
        if (node('user-form')) node('user-form').addEventListener('submit', event => { event.preventDefault(); return saveUser(); });
        if (node('user-cancel')) node('user-cancel').addEventListener('click', () => { if (!loading && !writing) { clearForm('user'); operation('user', 'idle', '已取消编辑。'); } });
        if (node('logout')) node('logout').addEventListener('click', logout);
        if (node('audit-prev')) node('audit-prev').addEventListener('click', () => { if (auditPage > 1) { auditPage -= 1; return loadAudit(auditPage); } });
        if (node('audit-next')) node('audit-next').addEventListener('click', () => { if (auditPage < auditTotalPages) { auditPage += 1; return loadAudit(auditPage); } });
        if (node('audit-refresh')) node('audit-refresh').addEventListener('click', () => loadAudit(auditPage));
        const icons = () => {
            try { window.lucide?.createIcons(); } catch (_error) { /* Decoration only. */ }
        };
        node('icons-sdk')?.addEventListener('load', icons);
        icons();
        tick();
        (window.setInterval || setInterval)(tick, 1000);
    }

    async function start() {
        bind();
        try {
            user = await window.DemoAPI.get('/api/v1/auth/me');
        } catch (error) {
            if (error?.status === 401) {
                window.location.replace('./login.html');
                return;
            }
            setStatus('error', `${error?.message || '无法连接服务，请稍后重试。'} 请重试。`);
            return;
        }
        role = user?.role || 'viewer';
        applyRole();
        setControls();
        loadAll();
        if (role === 'admin') {
            loadUsers(1);
            loadAudit(1);
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})(window);
