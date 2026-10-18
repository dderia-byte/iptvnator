// Slyk Q Fire TV app runtime config (replaces the PWA's assets/app-config.js).
// The backend is the app itself: SlykBackend answers /api/* on this origin.
window.__IPTVNATOR_CONFIG__ = Object.assign({}, window.__IPTVNATOR_CONFIG__, {
    BACKEND_URL: '/api',
});

// WebView request interception cannot read request bodies, so the one POST
// the PWA makes to its backend is sent as a GET with the URL as a query.
(function () {
    var open = XMLHttpRequest.prototype.open;
    var send = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.open = function (method, url) {
        this.__slykUrl = String(url);
        this.__slykArgs = Array.prototype.slice.call(arguments);
        return open.apply(this, arguments);
    };
    XMLHttpRequest.prototype.send = function (body) {
        var url = this.__slykUrl || '';
        if (/\/api\/provider-targets$/.test(url) && typeof body === 'string') {
            var target = '';
            try {
                target = JSON.parse(body).url || '';
            } catch (e) {}
            var args = this.__slykArgs.slice();
            args[0] = 'GET';
            args[1] = url + '?url=' + encodeURIComponent(target);
            open.apply(this, args);
            return send.call(this, null);
        }
        return send.apply(this, arguments);
    };
})();
