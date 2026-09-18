// xcratch-st share: CloudFront Function (viewer-request) for https://share.699.jp
//
//   /e/<id>[?bpa=..&ss=..]  ->  https://xcratch-st.699.jp/?bpa=..#https://share.699.jp/sb3/<id>.sb3
//   /p/<id>[?bpa=..&ss=..]  ->  https://xcratch-st.699.jp/player.html?..#https://share.699.jp/sb3/<id>.sb3
//
// The id is the S3 object name (sb3/<id>.sb3). Plain 302; the "open in Scrub"
// suggestion for iPads lives in the editor itself
// (packages/scratch-gui/src/playground/index.ejs) so that it covers every entry
// point, not only shared URLs. Deployed by scripts/setup-share-cloudfront.sh.
function handler(event) {
    var request = event.request;
    var m = request.uri.match(/^\/(e|p)\/([A-Za-z0-9_-]{8,64})\/?$/);
    if (!m) {
        return request;
    }
    var mode = m[1];
    var id = m[2];
    var qs = request.querystring;
    var params = [];
    var keep = ['bpa', 'ss'];
    for (var i = 0; i < keep.length; i++) {
        var k = keep[i];
        if (qs[k] && typeof qs[k].value === 'string' && /^[A-Za-z0-9_-]{0,16}$/.test(qs[k].value)) {
            params.push(k + '=' + qs[k].value);
        }
    }
    var target = 'https://xcratch-st.699.jp/' + (mode === 'p' ? 'player.html' : '') +
        (params.length ? '?' + params.join('&') : '') +
        '#https://share.699.jp/sb3/' + id + '.sb3';
    return {
        statusCode: 302,
        statusDescription: 'Found',
        headers: {
            location: {value: target},
            'cache-control': {value: 'no-store'}
        }
    };
}
