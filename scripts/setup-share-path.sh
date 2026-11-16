#!/usr/bin/env bash
# xcratch-st share: serve the share feature at https://xcratch.699.jp/share/
#
# School web filters allow xcratch.699.jp but block share.699.jp (and most
# likely the Lambda function URL and S3 too). This adds three paths to the
# existing xcratch.699.jp CloudFront distribution so that sharing needs no
# other host:
#
#   /share/api   -> presign Lambda (function URL)
#   /share/up    -> S3 bucket, presigned POST upload
#   /share/*     -> S3 bucket (read /share/sb3/*), and the /share/e/<id>,
#                   /share/p/<id> short URL redirects
#
# share.699.jp keeps working. Safe to re-run: every step is idempotent and
# only adds things. Run it BEFORE deploying an editor build that uses /share.
#
#   bash scripts/setup-share-path.sh
#
# Roll back: remove the three /share behaviors (and the `s3-share`,
# `s3-share-upload`, `lambda-share-presign` origins) from the distribution.
#
# Requires: aws CLI (CloudFront, Lambda, S3 permissions) and python3.
set -euo pipefail

DIST=EANHMK3G5XXI4                      # xcratch.699.jp
PUBLIC_ORIGIN=https://xcratch.699.jp
SHARE_DOMAIN=share.699.jp               # existing share distribution (source of the S3 origin settings)
REGION=ap-northeast-1
BUCKET=xcratch-share-699jp
LAMBDA=xcratch-share-presign
FUNC_NAME=xcratch-share-path
SHARE_RHP_NAME=xcratch-share-cors
CACHING_DISABLED=4135ea2d-6df8-44a3-9df3-4b5a84be39ad          # Managed-CachingDisabled
ALL_VIEWER_EXCEPT_HOST=b689b0a8-53d0-40ab-baf2-68738e2966ac    # Managed-AllViewerExceptHostHeader
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "== 1) CloudFront Function: /share/* routing and short URL redirects"
if aws cloudfront describe-function --name "$FUNC_NAME" >/dev/null 2>&1; then
    ETAG=$(aws cloudfront describe-function --name "$FUNC_NAME" --query ETag --output text)
    ETAG=$(aws cloudfront update-function --name "$FUNC_NAME" \
        --function-config Comment="xcratch.699.jp/share routing",Runtime=cloudfront-js-2.0 \
        --function-code "fileb://$SCRIPT_DIR/share-path-cloudfront-function.js" --if-match "$ETAG" --query ETag --output text)
else
    ETAG=$(aws cloudfront create-function --name "$FUNC_NAME" \
        --function-config Comment="xcratch.699.jp/share routing",Runtime=cloudfront-js-2.0 \
        --function-code "fileb://$SCRIPT_DIR/share-path-cloudfront-function.js" --query ETag --output text)
fi
FARN=$(aws cloudfront publish-function --name "$FUNC_NAME" --if-match "$ETAG" \
    --query FunctionSummary.FunctionMetadata.FunctionARN --output text)
echo "FARN=$FARN"
LIVE_ETAG=$(aws cloudfront describe-function --name "$FUNC_NAME" --query ETag --output text)
test_fn() {
    printf '{"version":"1.0","context":{"eventType":"viewer-request"},"viewer":{"ip":"1.1.1.1"},"request":{"method":"GET","uri":"%s","querystring":{"bpa":{"value":"2"}},"headers":{},"cookies":{}}}' "$1" > "$WORK/ev.json"
    aws cloudfront test-function --name "$FUNC_NAME" --if-match "$LIVE_ETAG" --stage LIVE \
        --event-object "fileb://$WORK/ev.json" --query 'TestResult.FunctionOutput' --output text | head -c 400
    echo
}
echo "test /share/e/<id>      (-> 302 /st/?bpa=2#...): $(test_fn /share/e/AbCdEfGhIjKlMnOp)"
echo "test /share/sb3/x.sb3   (-> uri /sb3/x.sb3):     $(test_fn /share/sb3/x.sb3)"
echo "test /share/api         (-> uri /):              $(test_fn /share/api)"

echo "== 2) Look up the pieces to wire together"
SHARE_DIST=$(aws cloudfront list-distributions \
    --query "DistributionList.Items[?Aliases.Quantity > \`0\` && contains(Aliases.Items, '$SHARE_DOMAIN')].Id | [0]" --output text)
SHARE_DARN=$(aws cloudfront get-distribution --id "$SHARE_DIST" --query Distribution.ARN --output text)
MAIN_DARN=$(aws cloudfront get-distribution --id "$DIST" --query Distribution.ARN --output text)
RHP=$(aws cloudfront list-response-headers-policies --type custom \
    --query "ResponseHeadersPolicyList.Items[?ResponseHeadersPolicy.ResponseHeadersPolicyConfig.Name=='$SHARE_RHP_NAME'].ResponseHeadersPolicy.Id | [0]" --output text)
LAMBDA_URL=$(aws lambda get-function-url-config --region "$REGION" --function-name "$LAMBDA" --query FunctionUrl --output text)
LAMBDA_HOST=${LAMBDA_URL#https://}
LAMBDA_HOST=${LAMBDA_HOST%/}
echo "SHARE_DIST=$SHARE_DIST RHP=$RHP LAMBDA_HOST=$LAMBDA_HOST"
aws cloudfront get-distribution-config --id "$SHARE_DIST" --output json > "$WORK/share-dist.json"

echo "== 3) Bucket policy: let both distributions read sb3/*"
aws s3api put-bucket-policy --bucket "$BUCKET" --policy "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Sid\":\"AllowCloudFrontRead\",\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"cloudfront.amazonaws.com\"},\"Action\":\"s3:GetObject\",\"Resource\":\"arn:aws:s3:::$BUCKET/sb3/*\",\"Condition\":{\"StringEquals\":{\"AWS:SourceArn\":[\"$SHARE_DARN\",\"$MAIN_DARN\"]}}}]}"

echo "== 4) Distribution $DIST: origins + behaviors /share/api, /share/up, /share/*"
aws cloudfront get-distribution-config --id "$DIST" --output json > "$WORK/dist.json"
DIST_ETAG=$(python3 - "$WORK/dist.json" "$WORK/dist-new.json" "$WORK/share-dist.json" \
    "$LAMBDA_HOST" "$FARN" "$RHP" "$CACHING_DISABLED" "$ALL_VIEWER_EXCEPT_HOST" <<'EOF'
import copy, json, sys
src, dst, share_src, lambda_host, farn, rhp, caching_disabled, all_viewer_except_host = sys.argv[1:9]
doc = json.load(open(src))
cfg = doc['DistributionConfig']
share_cfg = json.load(open(share_src))['DistributionConfig']

S3_READ, S3_UPLOAD, LAMBDA = 's3-share', 's3-share-upload', 'lambda-share-presign'

# S3 origins: copy the one of the share.699.jp distribution so every field is present.
# Read goes through the origin access control; upload must not (the browser's
# presigned POST policy is the authorization), hence a second origin without it.
s3_read = copy.deepcopy(next(o for o in share_cfg['Origins']['Items'] if 'S3OriginConfig' in o))
s3_read['Id'] = S3_READ
s3_upload = copy.deepcopy(s3_read)
s3_upload.update({'Id': S3_UPLOAD, 'OriginAccessControlId': ''})

# Lambda function URL: copy an existing custom origin of this distribution.
origins = cfg['Origins']['Items']
fn = copy.deepcopy(next(o for o in origins if 'CustomOriginConfig' in o))
fn.update({'Id': LAMBDA, 'DomainName': lambda_host, 'OriginPath': ''})
fn['CustomHeaders'] = {'Quantity': 0}
fn['CustomOriginConfig']['OriginProtocolPolicy'] = 'https-only'
fn.pop('OriginShield', None)
fn.pop('OriginAccessControlId', None)

new_ids = (S3_READ, S3_UPLOAD, LAMBDA)
origins[:] = [o for o in origins if o['Id'] not in new_ids] + [s3_read, s3_upload, fn]
cfg['Origins']['Quantity'] = len(origins)

READ = ['HEAD', 'GET', 'OPTIONS']
ALL = ['HEAD', 'DELETE', 'POST', 'GET', 'OPTIONS', 'PUT', 'PATCH']

def behavior(pattern, origin_id, methods, origin_request_policy=None, response_headers_policy=None):
    b = copy.deepcopy(cfg['DefaultCacheBehavior'])
    for k in ('OriginRequestPolicyId', 'ResponseHeadersPolicyId', 'RealtimeLogConfigArn',
              'ForwardedValues', 'MinTTL', 'DefaultTTL', 'MaxTTL'):
        b.pop(k, None)
    b.update({
        'PathPattern': pattern,
        'TargetOriginId': origin_id,
        'ViewerProtocolPolicy': 'redirect-to-https',
        'AllowedMethods': {'Quantity': len(methods), 'Items': methods,
                           'CachedMethods': {'Quantity': 2, 'Items': ['HEAD', 'GET']}},
        'Compress': False,
        # Never cached: a deleted share must stop working at once, and the Lambda
        # only invalidates the share.699.jp distribution.
        'CachePolicyId': caching_disabled,
        'LambdaFunctionAssociations': {'Quantity': 0},
        'FunctionAssociations': {'Quantity': 1, 'Items': [
            {'FunctionARN': farn, 'EventType': 'viewer-request'}]},
    })
    if origin_request_policy:
        b['OriginRequestPolicyId'] = origin_request_policy
    if response_headers_policy:
        b['ResponseHeadersPolicyId'] = response_headers_policy
    return b

# Order matters: the two exact paths must come before /share/*.
new = [
    behavior('/share/api', LAMBDA, ALL, origin_request_policy=all_viewer_except_host),
    behavior('/share/up', S3_UPLOAD, ALL, origin_request_policy=all_viewer_except_host),
    behavior('/share/*', S3_READ, READ, response_headers_policy=rhp),
]
patterns = [b['PathPattern'] for b in new]
behaviors = cfg.setdefault('CacheBehaviors', {'Quantity': 0})
items = [b for b in behaviors.get('Items', []) if b['PathPattern'] not in patterns] + new
behaviors['Items'] = items
behaviors['Quantity'] = len(items)

json.dump(cfg, open(dst, 'w'))
print(doc['ETag'])
EOF
)
aws cloudfront update-distribution --id "$DIST" --if-match "$DIST_ETAG" \
    --distribution-config "file://$WORK/dist-new.json" --query Distribution.Status --output text

echo "== waiting for the distribution to deploy (a few minutes)"
aws cloudfront wait distribution-deployed --id "$DIST"

echo "== check"
echo "/share/e/<id>   : $(curl -s -o /dev/null -w '%{http_code} -> %{redirect_url}' "$PUBLIC_ORIGIN/share/e/AbCdEfGhIjKlMnOp?bpa=2")"
echo "/share/sb3/none : $(curl -s -o /dev/null -w '%{http_code}' "$PUBLIC_ORIGIN/share/sb3/none.sb3")  (403 = reaches S3, no such share)"
curl -s -m 20 -X POST -H "origin: $PUBLIC_ORIGIN" -H 'content-type: application/json' \
    -d '{"mode":"editor","size":1}' "$PUBLIC_ORIGIN/share/api" > "$WORK/presign.json" || true
echo "/share/api      : $(python3 -c "import json,sys; d=json.load(open(sys.argv[1])); print('ok, id', d['id']) if 'id' in d else print('unexpected', d)" "$WORK/presign.json" 2>&1 | head -c 300)"
echo "/st/            : $(curl -s -o /dev/null -w '%{http_code}' "$PUBLIC_ORIGIN/st/")  (must still be 200)"
echo "/               : $(curl -s -o /dev/null -w '%{http_code}' "$PUBLIC_ORIGIN/")  (old editor, must still be 200)"
echo "/ext/           : $(curl -s -o /dev/null -w '%{http_code}' "$PUBLIC_ORIGIN/ext/?url=microbit-more/dist/microbitMore.mjs")  (must still be 200)"
echo "done: $PUBLIC_ORIGIN/share/  (upload itself is exercised by sharing a project from $PUBLIC_ORIGIN/st/)"
