// xcratch-st: CloudFront Function (viewer-request) for https://xcratch.699.jp/st/
//
//   /st        ->  301 /st/ (query string kept)
//   /st/<path> ->  origin request for /<path>
//
// The origin is the GitHub Pages site (xcratch-st.699.jp), which serves the
// editor at its root, so the /st prefix is stripped before the request is
// forwarded. Attached to the `/st` and `/st/*` behaviors of the xcratch.699.jp
// distribution by scripts/setup-st-path.sh.
function handler(event) {
    var request = event.request;
    var uri = request.uri;
    if (uri === '/st') {
        var qs = request.querystring;
        var parts = [];
        for (var key in qs) {
            var entry = qs[key];
            var values = entry.multiValue ? entry.multiValue : [entry];
            for (var i = 0; i < values.length; i++) {
                parts.push(values[i].value === '' ? key : key + '=' + values[i].value);
            }
        }
        return {
            statusCode: 301,
            statusDescription: 'Moved Permanently',
            headers: {
                location: {value: '/st/' + (parts.length ? '?' + parts.join('&') : '')}
            }
        };
    }
    if (uri.indexOf('/st/') === 0) {
        request.uri = uri.substring(3);
    }
    return request;
}
