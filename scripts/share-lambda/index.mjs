// xcratch-st share: issue a presigned S3 POST so the browser can upload a .sb3 directly.
import {randomBytes} from 'node:crypto';
import {S3Client} from '@aws-sdk/client-s3';
import {createPresignedPost} from '@aws-sdk/s3-presigned-post';

const BUCKET = process.env.BUCKET;               // xcratch-share-699jp
const SHARE_HOST = process.env.SHARE_HOST;       // https://share.699.jp
const MAX_BYTES = 100 * 1024 * 1024;             // 100 MB
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const CONTENT_TYPE = 'application/x.scratch.sb3';

const s3 = new S3Client({});

const json = (statusCode, body) => ({
    statusCode,
    headers: {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'},
    body: JSON.stringify(body)
});

export const handler = async event => {
    const method = event.requestContext?.http?.method;
    if (method !== 'POST') return json(405, {error: 'method not allowed'});
    const origin = event.headers?.origin || '';
    if (!ALLOWED_ORIGINS.includes(origin)) return json(403, {error: 'origin not allowed'});

    // 12 random bytes -> 16 chars of base64url: unguessable, URL safe
    const id = randomBytes(12).toString('base64url');
    const key = `sb3/${id}.sb3`;
    const {url, fields} = await createPresignedPost(s3, {
        Bucket: BUCKET,
        Key: key,
        Conditions: [
            ['content-length-range', 1, MAX_BYTES],
            ['eq', '$Content-Type', CONTENT_TYPE]
        ],
        Fields: {'Content-Type': CONTENT_TYPE},
        Expires: 600
    });
    return json(200, {
        id,
        uploadUrl: url,
        fields,
        fileUrl: `${SHARE_HOST}/${key}`,
        editorUrl: `${SHARE_HOST}/e/${id}`,
        playerUrl: `${SHARE_HOST}/p/${id}`,
        maxBytes: MAX_BYTES,
        expiresDays: 7
    });
};
