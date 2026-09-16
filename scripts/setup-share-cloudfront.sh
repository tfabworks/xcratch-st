#!/usr/bin/env bash
# xcratch-st share: CloudFront / DNS setup for https://share.699.jp
#
# Run this once, after the S3 bucket (xcratch-share-699jp) and the Lambda
# (xcratch-share-presign) exist. Safe to re-run: every step is idempotent.
#
#   bash scripts/setup-share-cloudfront.sh
#
# Requires: aws CLI with credentials that can manage CloudFront, S3 bucket
# policies and the 699.jp hosted zone in Route 53.
set -euo pipefail

BUCKET=xcratch-share-699jp
ORIGIN_DOMAIN="$BUCKET.s3.ap-northeast-1.amazonaws.com"
CERT_ARN=arn:aws:acm:us-east-1:904527142774:certificate/19fb5b74-9d00-4017-8129-963722eeff50   # *.699.jp
HOSTED_ZONE_ID=Z0845714Q5S6VFEEDHNT   # 699.jp
CF_HOSTED_ZONE_ID=Z2FDTNDATAQYW2       # fixed id for CloudFront aliases
SHARE_DOMAIN=share.699.jp
FUNC_NAME=xcratch-share-redirect
WORK="$(mktemp -d)"

echo "== 1) Origin access control"
OAC=$(aws cloudfront list-origin-access-controls \
    --query "OriginAccessControlList.Items[?Name=='xcratch-share-oac'].Id | [0]" --output text)
if [ -z "$OAC" ] || [ "$OAC" = "None" ]; then
    OAC=$(aws cloudfront create-origin-access-control \
        --origin-access-control-config Name=xcratch-share-oac,SigningProtocol=sigv4,SigningBehavior=always,OriginAccessControlOriginType=s3 \
        --query OriginAccessControl.Id --output text)
fi
echo "OAC=$OAC"

echo "== 2) Response headers policy (CORS for the editor origins)"
RHP=$(aws cloudfront list-response-headers-policies --type custom \
    --query "ResponseHeadersPolicyList.Items[?ResponseHeadersPolicy.ResponseHeadersPolicyConfig.Name=='xcratch-share-cors'].ResponseHeadersPolicy.Id | [0]" --output text)
if [ -z "$RHP" ] || [ "$RHP" = "None" ]; then
    RHP=$(aws cloudfront create-response-headers-policy --response-headers-policy-config '{
        "Name":"xcratch-share-cors","Comment":"CORS for xcratch-st shared projects",
        "CorsConfig":{
            "AccessControlAllowOrigins":{"Quantity":4,"Items":["https://xcratch-st.699.jp","http://127.0.0.1:8000","http://localhost:8601","http://localhost:8000"]},
            "AccessControlAllowHeaders":{"Quantity":1,"Items":["*"]},
            "AccessControlAllowMethods":{"Quantity":3,"Items":["GET","HEAD","OPTIONS"]},
            "AccessControlAllowCredentials":false,"AccessControlMaxAgeSec":3600,"OriginOverride":true}}' \
        --query ResponseHeadersPolicy.Id --output text)
fi
echo "RHP=$RHP"

echo "== 3) CloudFront Function: /e/<id>, /p/<id> -> editor / player (keeps ?bpa= and ?ss=)"
cat > "$WORK/redirect.js" <<'EOF'
// xcratch-st share: short URL -> editor/player URL. The id is the S3 object name (sb3/<id>.sb3).
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
EOF
if aws cloudfront describe-function --name "$FUNC_NAME" >/dev/null 2>&1; then
    ETAG=$(aws cloudfront describe-function --name "$FUNC_NAME" --query ETag --output text)
    ETAG=$(aws cloudfront update-function --name "$FUNC_NAME" \
        --function-config Comment="xcratch-st share short URL redirect",Runtime=cloudfront-js-2.0 \
        --function-code "fileb://$WORK/redirect.js" --if-match "$ETAG" --query ETag --output text)
else
    ETAG=$(aws cloudfront create-function --name "$FUNC_NAME" \
        --function-config Comment="xcratch-st share short URL redirect",Runtime=cloudfront-js-2.0 \
        --function-code "fileb://$WORK/redirect.js" --query ETag --output text)
fi
FARN=$(aws cloudfront publish-function --name "$FUNC_NAME" --if-match "$ETAG" \
    --query FunctionSummary.FunctionMetadata.FunctionARN --output text)
echo "FARN=$FARN"
printf '{"version":"1.0","context":{"eventType":"viewer-request"},"viewer":{"ip":"1.1.1.1"},"request":{"method":"GET","uri":"/e/AbCdEfGhIjKlMnOp","querystring":{"bpa":{"value":"0"}},"headers":{},"cookies":{}}}' > "$WORK/ev.json"
echo "test: $(aws cloudfront test-function --name "$FUNC_NAME" --if-match "$(aws cloudfront describe-function --name "$FUNC_NAME" --query ETag --output text)" --stage LIVE --event-object "fileb://$WORK/ev.json" --query 'TestResult.FunctionOutput' --output text | head -c 300)"

echo "== 4) Distribution"
DIST=$(aws cloudfront list-distributions \
    --query "DistributionList.Items[?contains(Aliases.Items, '$SHARE_DOMAIN')].Id | [0]" --output text)
if [ -z "$DIST" ] || [ "$DIST" = "None" ]; then
    cat > "$WORK/dist.json" <<EOF
{
  "CallerReference": "xcratch-share-$(date +%s)",
  "Comment": "xcratch-st shared projects ($SHARE_DOMAIN)",
  "Enabled": true,
  "Aliases": {"Quantity": 1, "Items": ["$SHARE_DOMAIN"]},
  "HttpVersion": "http2and3",
  "IsIPV6Enabled": true,
  "PriceClass": "PriceClass_200",
  "Origins": {"Quantity": 1, "Items": [{
    "Id": "s3-share", "DomainName": "$ORIGIN_DOMAIN", "OriginAccessControlId": "$OAC",
    "S3OriginConfig": {"OriginAccessIdentity": ""}
  }]},
  "DefaultCacheBehavior": {
    "TargetOriginId": "s3-share",
    "ViewerProtocolPolicy": "redirect-to-https",
    "AllowedMethods": {"Quantity": 3, "Items": ["GET","HEAD","OPTIONS"], "CachedMethods": {"Quantity": 3, "Items": ["GET","HEAD","OPTIONS"]}},
    "Compress": false,
    "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",
    "ResponseHeadersPolicyId": "$RHP",
    "FunctionAssociations": {"Quantity": 1, "Items": [{"FunctionARN": "$FARN", "EventType": "viewer-request"}]}
  },
  "CustomErrorResponses": {"Quantity": 1, "Items": [{"ErrorCode": 403, "ResponseCode": "404", "ResponsePagePath": "", "ErrorCachingMinTTL": 10}]},
  "ViewerCertificate": {"ACMCertificateArn": "$CERT_ARN", "SSLSupportMethod": "sni-only", "MinimumProtocolVersion": "TLSv1.2_2021"}
}
EOF
    DIST=$(aws cloudfront create-distribution --distribution-config "file://$WORK/dist.json" \
        --query Distribution.Id --output text)
fi
DOMAIN=$(aws cloudfront get-distribution --id "$DIST" --query Distribution.DomainName --output text)
DARN=$(aws cloudfront get-distribution --id "$DIST" --query Distribution.ARN --output text)
echo "DIST=$DIST DOMAIN=$DOMAIN"

echo "== 5) Bucket policy: let this distribution read sb3/*"
aws s3api put-bucket-policy --bucket "$BUCKET" --policy "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Sid\":\"AllowCloudFrontRead\",\"Effect\":\"Allow\",\"Principal\":{\"Service\":\"cloudfront.amazonaws.com\"},\"Action\":\"s3:GetObject\",\"Resource\":\"arn:aws:s3:::$BUCKET/sb3/*\",\"Condition\":{\"StringEquals\":{\"AWS:SourceArn\":\"$DARN\"}}}]}"

echo "== 6) Route 53: $SHARE_DOMAIN -> $DOMAIN"
aws route53 change-resource-record-sets --hosted-zone-id "$HOSTED_ZONE_ID" --change-batch "{\"Changes\":[
 {\"Action\":\"UPSERT\",\"ResourceRecordSet\":{\"Name\":\"$SHARE_DOMAIN\",\"Type\":\"A\",\"AliasTarget\":{\"HostedZoneId\":\"$CF_HOSTED_ZONE_ID\",\"DNSName\":\"$DOMAIN\",\"EvaluateTargetHealth\":false}}},
 {\"Action\":\"UPSERT\",\"ResourceRecordSet\":{\"Name\":\"$SHARE_DOMAIN\",\"Type\":\"AAAA\",\"AliasTarget\":{\"HostedZoneId\":\"$CF_HOSTED_ZONE_ID\",\"DNSName\":\"$DOMAIN\",\"EvaluateTargetHealth\":false}}}]}" \
    --query ChangeInfo.Status --output text

echo "== waiting for the distribution to deploy (a few minutes)"
aws cloudfront wait distribution-deployed --id "$DIST"
echo "done: https://$SHARE_DOMAIN/  (status: $(aws cloudfront get-distribution --id "$DIST" --query Distribution.Status --output text))"
rm -rf "$WORK"
