// xcratch-st share: CloudFront Function (viewer-request) for https://xcratch.699.jp/share/
//
// The share feature under the editor's own host, for networks whose web filter
// allows xcratch.699.jp but not share.699.jp / *.on.aws / *.amazonaws.com.
//
//   /share/e/<id>[?bpa=..&ss=..]  ->  302 https://xcratch.699.jp/st/?bpa=..#https://xcratch.699.jp/share/sb3/<id>.sb3
//   /share/p/<id>[?bpa=..&ss=..]  ->  302 https://xcratch.699.jp/st/player.html?..#(same)
//   /share/sb3/<name>             ->  origin request for /sb3/<name>   (S3, read)
//   /share/api                    ->  origin request for /             (presign Lambda)
//   /share/up                     ->  origin request for /             (S3 POST upload)
//
// Attached to the `/share/api`, `/share/up` and `/share/*` behaviors of the
// xcratch.699.jp distribution by scripts/setup-share-path.sh.
function handler(event) {
    var request = event.request;
    var uri = request.uri;
    var m = uri.match(/^\/share\/(e|p)\/([A-Za-z0-9_-]{8,64})\/?$/);
    if (m) {
        var qs = request.querystring;
        var params = [];
        var keep = ['bpa', 'ss'];
        for (var i = 0; i < keep.length; i++) {
            var k = keep[i];
            if (qs[k] && typeof qs[k].value === 'string' && /^[A-Za-z0-9_-]{0,16}$/.test(qs[k].value)) {
                params.push(k + '=' + qs[k].value);
            }
        }
        var target = 'https://xcratch.699.jp/st/' + (m[1] === 'p' ? 'player.html' : '') +
            (params.length ? '?' + params.join('&') : '') +
            '#https://xcratch.699.jp/share/sb3/' + m[2] + '.sb3';
        return {
            statusCode: 302,
            statusDescription: 'Found',
            headers: {
                location: {value: target},
                'cache-control': {value: 'no-store'}
            }
        };
    }
    if (uri === '/share/api' || uri === '/share/up') {
        request.uri = '/';
    } else if (uri.indexOf('/share/') === 0) {
        request.uri = uri.substring(6);
    }
    return request;
}
