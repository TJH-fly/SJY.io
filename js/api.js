(function (window) {
    'use strict';

    // This small client owns transport only; page controllers own their DOM and data contract.
    class APIError extends Error {
        constructor(message, code, status, requestId) {
            super(message);
            this.name = 'APIError';
            this.code = code;
            this.status = status;
            this.requestId = requestId;
        }
    }

    const TOKEN_KEY = 'sanjiang_session_token';

    function apiBase() {
        const runtime = window.SANJIANG_API_BASE;
        const configured = window.SANJIANG_CONFIG && window.SANJIANG_CONFIG.apiBase;
        return String(runtime || configured || '').replace(/\/+$/, '');
    }

    function readToken() {
        try {
            return window.localStorage.getItem(TOKEN_KEY) || '';
        } catch (_error) {
            return '';
        }
    }

    function storeToken(token) {
        try {
            if (token) window.localStorage.setItem(TOKEN_KEY, token);
            else window.localStorage.removeItem(TOKEN_KEY);
        } catch (_error) { /* Storage may be unavailable; cookies still work same-origin. */ }
    }

    function clearToken() {
        storeToken('');
    }

    async function request(methodOrPath, pathOrOptions, requestOptions = {}) {
        // Retain the original path-first call for existing dashboard integrations.
        const methodFirst = typeof pathOrOptions === 'string';
        const path = methodFirst ? pathOrOptions : methodOrPath;
        const config = methodFirst ? requestOptions : (pathOrOptions || {});
        const { timeoutMs = 10000 } = config;
        const method = methodFirst ? methodOrPath : (config.method || 'GET');
        const hasJSON = Object.prototype.hasOwnProperty.call(config, 'json');
        const body = hasJSON ? config.json : config.body;
        const multipart = typeof FormData !== 'undefined' && body instanceof FormData;
        const base = apiBase();
        const url = base + '/' + String(path).replace(/^\/+/, '');
        const controller = new AbortController();
        let timer;
        let timedOut = false;
        const deadline = new Promise((_resolve, reject) => {
            timer = setTimeout(() => {
                timedOut = true;
                controller.abort();
                reject(new APIError('请求超时，请检查服务后重试。', 'TIMEOUT'));
            }, Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 10000);
        });
        const pendingResponse = (async () => {
            const options = { method: String(method).toUpperCase(), credentials: base ? 'include' : 'same-origin', headers: { Accept: 'application/json' }, signal: controller.signal };
            const token = readToken();
            if (token) options.headers.Authorization = `Bearer ${token}`;
            if (body !== undefined) options.body = multipart ? body : JSON.stringify(body);
            if (body !== undefined && !multipart) options.headers['Content-Type'] = 'application/json';
            const response = await fetch(url, options);
            const issued = response.headers && typeof response.headers.get === 'function' ? response.headers.get('X-Session-Token') : '';
            if (issued) storeToken(issued);
            let payload;
            try {
                payload = await response.json();
            } catch (_error) {
                throw new APIError(`服务响应不是有效 JSON（HTTP ${response.status}）。`, 'INVALID_RESPONSE', response.status);
            }
            if (!response.ok) {
                if (response.status === 401) clearToken();
                const message = typeof payload?.message === 'string' ? payload.message : `服务请求失败（HTTP ${response.status}）。`;
                throw new APIError(message, payload?.code || 'HTTP_ERROR', response.status, payload?.requestId);
            }
            if (!payload || !Object.prototype.hasOwnProperty.call(payload, 'data') || !payload.data || typeof payload.data !== 'object') {
                throw new APIError('服务返回的数据格式不正确，请确认 API 地址。', 'INVALID_RESPONSE', response.status, payload?.requestId);
            }
            return payload.data;
        })();
        try {
            return await Promise.race([pendingResponse, deadline]);
        } catch (error) {
            if (timedOut) throw new APIError('请求超时，请检查服务后重试。', 'TIMEOUT');
            if (error instanceof APIError) throw error;
            throw new APIError('无法连接服务，请检查网络和后端是否已启动。', 'NETWORK_ERROR');
        } finally {
            clearTimeout(timer);
        }
    }

    function get(path, { timeoutMs } = {}) {
        return request(path, { method: 'GET', timeoutMs });
    }

    function assetUrl(path) {
        const value = String(path || '');
        if (!value || /^https?:\/\//i.test(value)) return value;
        // Uploaded media lives on the API host; bundled demo images ship with the page.
        if (/^\/uploads\//.test(value)) return apiBase() + value;
        return value;
    }

    window.DemoAPI = Object.freeze({ get, request, apiBase, assetUrl, readToken, storeToken, clearToken });
})(window);
