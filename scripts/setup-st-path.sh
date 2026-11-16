#!/usr/bin/env bash
# xcratch-st: serve the editor at https://xcratch.699.jp/st/
#
# Adds a `/st` path to the existing xcratch.699.jp CloudFront distribution,
# backed by the GitHub Pages site (https://xcratch-st.699.jp/), and lets the
# new origin use the share feature (share.699.jp). The old URL keeps working.
# Safe to re-run: every step is idempotent and only adds things.
#
#   bash scripts/setup-st-path.sh
#
# Afterwards, to point shared short URLs at the new location, re-run
#   bash scripts/setup-share-cloudfront.sh
#
# Roll back: remove the `/st` and `/st/*` behaviors (and the
# `github-pages-xcratch-st` origin) from the distribution.
#
# Requires: aws CLI (CloudFront, Lambda, S3 permissions) and python3.
set -euo pipefail

DIST=EANHMK3G5XXI4                      # xcratch.699.jp
PUBLIC_ORIGIN=https://xcratch.699.jp    # browser origin of the new location
PAGES_DOMAIN=xcratch-st.699.jp          # GitHub Pages custom domain (the origin)
ORIGIN_ID=github-pages-xcratch-st
FUNC_NAME=xcratch-st-path
CACHE_POLICY=658327ea-f89d-4fab-a63d-7e88639e58f6   # Managed-CachingOptimized (honors max-age=600 from Pages)
REGION=ap-northeast-1
BUCKET=xcratch-share-699jp
LAMBDA=xcratch-share-presign
SHARE_RHP_NAME=xcratch-share-cors
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "== 1) CloudFront Function: strip the /st prefix"
if aws cloudfront describe-function --name "$FUNC_NAME" >/dev/null 2>&1; then
    ETAG=$(aws cloudfront describe-function --name "$FUNC_NAME" --query ETag --output text)
    ETAG=$(aws cloudfront update-function --name "$FUNC_NAME" \
        --function-config Comment="xcratch.699.jp/st -> GitHub Pages root",Runtime=cloudfront-js-2.0 \
        --function-code "fileb://$SCRIPT_DIR/st-path-cloudfront-function.js" --if-match "$ETAG" --query ETag --output text)
else
    ETAG=$(aws cloudfront create-function --name "$FUNC_NAME" \
        --function-config Comment="xcratch.699.jp/st -> GitHub Pages root",Runtime=cloudfront-js-2.0 \
        --function-code "fileb://$SCRIPT_DIR/st-path-cloudfront-function.js" --query ETag --output text)
fi
FARN=$(aws cloudfront publish-function --name "$FUNC_NAME" --if-match "$ETAG" \
    --query FunctionSummary.FunctionMetadata.FunctionARN --output text)
echo "FARN=$FARN"
LIVE_ETAG=$(aws cloudfront describe-function --name "$FUNC_NAME" --query ETag --output text)
test_fn() {
    printf '{"version":"1.0","context":{"eventType":"viewer-request"},"viewer":{"ip":"1.1.1.1"},"request":{"method":"GET","uri":"%s","querystring":{"bpa":{"value":"2"}},"headers":{},"cookies":{}}}' "$1" > "$WORK/ev.json"
    aws cloudfront test-function --name "$FUNC_NAME" --if-match "$LIVE_ETAG" --stage LIVE \
        --event-object "fileb://$WORK/ev.json" --query 'TestResult.FunctionOutput' --output text | head -c 300
    echo
}
echo "test /st            (-> 301 /st/?bpa=2): $(test_fn /st)"
echo "test /st/           (-> uri /):          $(test_fn /st/)"
echo "test /st/player.html (-> uri /player.html): $(test_fn /st/player.html)"

echo "== 2) Distribution $DIST: origin $PAGES_DOMAIN + behaviors /st, /st/*"
aws cloudfront get-distribution-config --id "$DIST" --output json > "$WORK/dist.json"
DIST_ETAG=$(python3 - "$WORK/dist.json" "$WORK/dist-new.json" "$ORIGIN_ID" "$PAGES_DOMAIN" "$CACHE_POLICY" "$FARN" <<'EOF'
import copy, json, sys
src, dst, origin_id, pages_domain, cache_policy, farn = sys.argv[1:7]
doc = json.load(open(src))
cfg = doc['DistributionConfig']

# Origin: copy an existing custom origin so every required field is present.
origins = cfg['Origins']['Items']
template = next(o for o in origins if 'CustomOriginConfig' in o)
origin = copy.deepcopy(template)
origin.update({'Id': origin_id, 'DomainName': pages_domain, 'OriginPath': ''})
origin['CustomHeaders'] = {'Quantity': 0}
origin['CustomOriginConfig']['OriginProtocolPolicy'] = 'https-only'
origin.pop('OriginShield', None)
origin.pop('OriginAccessControlId', None)
origins[:] = [o for o in origins if o['Id'] != origin_id] + [origin]
cfg['Origins']['Quantity'] = len(origins)

# Behaviors: copy the default one, then make it a plain cached static site.
# No origin request policy (the Host header must be the Pages domain, not the
# viewer's) and no response headers policy (same headers as GitHub Pages today).
def behavior(pattern):
    b = copy.deepcopy(cfg['DefaultCacheBehavior'])
    for k in ('OriginRequestPolicyId', 'ResponseHeadersPolicyId', 'RealtimeLogConfigArn',
              'ForwardedValues', 'MinTTL', 'DefaultTTL', 'MaxTTL'):
        b.pop(k, None)
    b.update({
        'PathPattern': pattern,
        'TargetOriginId': origin_id,
        'ViewerProtocolPolicy': 'redirect-to-https',
        'AllowedMethods': {'Quantity': 2, 'Items': ['HEAD', 'GET'],
                           'CachedMethods': {'Quantity': 2, 'Items': ['HEAD', 'GET']}},
        'Compress': True,
        'CachePolicyId': cache_policy,
        'LambdaFunctionAssociations': {'Quantity': 0},
        'FunctionAssociations': {'Quantity': 1, 'Items': [
            {'FunctionARN': farn, 'EventType': 'viewer-request'}]},
    })
    return b

patterns = ['/st', '/st/*']
behaviors = cfg.setdefault('CacheBehaviors', {'Quantity': 0})
items = [b for b in behaviors.get('Items', []) if b['PathPattern'] not in patterns]
items += [behavior(p) for p in patterns]
behaviors['Items'] = items
behaviors['Quantity'] = len(items)

json.dump(cfg, open(dst, 'w'))
print(doc['ETag'])
EOF
)
aws cloudfront update-distribution --id "$DIST" --if-match "$DIST_ETAG" \
    --distribution-config "file://$WORK/dist-new.json" --query Distribution.Status --output text

# Helper: add $PUBLIC_ORIGIN to the list at a dotted path inside a JSON file.
# Prints "changed" or "unchanged".
add_origin() {
    python3 - "$1" "$2" "$PUBLIC_ORIGIN" "${3:-}" <<'EOF'
import json, sys
path, dotted, origin, mode = sys.argv[1:5]
doc = json.load(open(path))
node = doc
keys = dotted.split('.')
for k in keys[:-1]:
    node = node[int(k)] if k.isdigit() else node[k]
value = node[keys[-1]]
if mode == 'csv':
    items = [s.strip() for s in value.split(',') if s.strip()]
else:
    items = value
changed = origin not in items
if changed:
    items.insert(0, origin)
    node[keys[-1]] = ','.join(items) if mode == 'csv' else items
    if 'Quantity' in node and mode != 'csv':
        node['Quantity'] = len(items)
    json.dump(doc, open(path, 'w'))
print('changed' if changed else 'unchanged')
EOF
}

echo "== 3) share.699.jp: let $PUBLIC_ORIGIN read shared projects (response headers policy)"
RHP=$(aws cloudfront list-response-headers-policies --type custom \
    --query "ResponseHeadersPolicyList.Items[?ResponseHeadersPolicy.ResponseHeadersPolicyConfig.Name=='$SHARE_RHP_NAME'].ResponseHeadersPolicy.Id | [0]" --output text)
aws cloudfront get-response-headers-policy-config --id "$RHP" --output json > "$WORK/rhp-full.json"
RHP_ETAG=$(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); json.dump(d['ResponseHeadersPolicyConfig'], open(sys.argv[2],'w')); print(d['ETag'])" "$WORK/rhp-full.json" "$WORK/rhp.json")
if [ "$(add_origin "$WORK/rhp.json" CorsConfig.AccessControlAllowOrigins.Items)" = changed ]; then
    aws cloudfront update-response-headers-policy --id "$RHP" --if-match "$RHP_ETAG" \
        --response-headers-policy-config "file://$WORK/rhp.json" --query ResponseHeadersPolicy.Id --output text
else
    echo "already allowed"
fi

echo "== 4) share upload: Lambda $LAMBDA (ALLOWED_ORIGINS + Function URL CORS)"
aws lambda get-function-configuration --region "$REGION" --function-name "$LAMBDA" \
    --query '{Variables: Environment.Variables}' --output json > "$WORK/env.json"
if [ "$(add_origin "$WORK/env.json" Variables.ALLOWED_ORIGINS csv)" = changed ]; then
    aws lambda update-function-configuration --region "$REGION" --function-name "$LAMBDA" \
        --environment "file://$WORK/env.json" --query LastUpdateStatus --output text
    aws lambda wait function-updated --region "$REGION" --function-name "$LAMBDA"
else
    echo "env: already allowed"
fi
aws lambda get-function-url-config --region "$REGION" --function-name "$LAMBDA" \
    --query Cors --output json > "$WORK/url-cors.json"
if [ "$(add_origin "$WORK/url-cors.json" AllowOrigins)" = changed ]; then
    aws lambda update-function-url-config --region "$REGION" --function-name "$LAMBDA" \
        --cors "file://$WORK/url-cors.json" --query FunctionUrl --output text
else
    echo "function URL: already allowed"
fi

echo "== 5) share upload: S3 bucket CORS ($BUCKET)"
aws s3api get-bucket-cors --bucket "$BUCKET" --output json > "$WORK/bucket-cors.json"
if [ "$(add_origin "$WORK/bucket-cors.json" CORSRules.0.AllowedOrigins)" = changed ]; then
    aws s3api put-bucket-cors --bucket "$BUCKET" --cors-configuration "file://$WORK/bucket-cors.json"
    echo "updated"
else
    echo "already allowed"
fi

echo "== waiting for the distribution to deploy (a few minutes)"
aws cloudfront wait distribution-deployed --id "$DIST"

echo "== check"
echo "/st   : $(curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}' "$PUBLIC_ORIGIN/st")"
echo "/st/  : $(curl -s -o /dev/null -w '%{http_code} %{content_type}' "$PUBLIC_ORIGIN/st/")"
echo "gui.js: $(curl -s -o /dev/null -w '%{http_code} %{size_download} bytes' "$PUBLIC_ORIGIN/st/gui.js")"
echo "/     : $(curl -s -o /dev/null -w '%{http_code}' "$PUBLIC_ORIGIN/")  (old editor, must still be 200)"
echo "/ext/ : $(curl -s -o /dev/null -w '%{http_code}' "$PUBLIC_ORIGIN/ext/?url=microbit-more/dist/microbitMore.mjs")  (must still be 200)"
echo "done: $PUBLIC_ORIGIN/st/"
