// Deployment configuration.
// Local demos served by FastAPI stay same-origin; the GitHub Pages build talks to the public API.
(function (window) {
    'use strict';
    const host = String((window.location && window.location.hostname) || '');
    const local = !host || host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
    window.SANJIANG_CONFIG = Object.freeze({
        apiBase: local ? '' : 'https://sjy888.site'
    });
})(window);
