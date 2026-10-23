(function (window) {
    'use strict';

    const document = window.document;
    let busy = false;

    function node(id) {
        return document.getElementById(id);
    }

    function message(text, state) {
        const status = node('login-status');
        if (status) {
            status.dataset.state = state;
            status.textContent = text;
        }
    }

    function setBusy(value) {
        busy = value;
        const submit = node('login-submit');
        if (submit) submit.disabled = value;
    }

    function redirect() {
        window.location.replace('./admin.html');
    }

    async function checkSession() {
        setBusy(true);
        try {
            await window.DemoAPI.get('/api/v1/auth/me');
            redirect();
        } catch (error) {
            message(error?.status === 401 ? '请登录后使用后台管理。' : (error?.message || '无法连接服务'), 'idle');
            setBusy(false);
        }
    }

    async function submit(event) {
        if (event && typeof event.preventDefault === 'function') event.preventDefault();
        if (busy) return;
        const username = node('login-username')?.value || '';
        const password = node('login-password')?.value || '';
        setBusy(true);
        message('正在登录…', 'loading');
        try {
            await window.DemoAPI.request('POST', '/api/v1/auth/login', { json: { username, password } });
            redirect();
        } catch (error) {
            message(error?.message || '无法连接服务，请检查网络。', 'error');
            setBusy(false);
        }
    }

    function start() {
        node('login-form')?.addEventListener('submit', submit);
        checkSession();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})(window);
