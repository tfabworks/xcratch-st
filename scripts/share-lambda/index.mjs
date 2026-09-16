// xcratch-st share: issue a presigned S3 POST so the browser can upload a .sb3 directly,
// and delete a shared .sb3 when the uploading browser presents its delete token.
import {createHmac, randomBytes, timingSafeEqual} from 'node:crypto';
import {S3Client, DeleteObjectCommand} from '@aws-sdk/client-s3';
import {createPresignedPost} from '@aws-sdk/s3-presigned-post';
import {CloudFrontClient, CreateInvalidationCommand} from '@aws-sdk/client-cloudfront';

const BUCKET = process.env.BUCKET;                   // xcratch-share-699jp
const SHARE_HOST = process.env.SHARE_HOST;           // https://share.699.jp
const DISTRIBUTION_ID = process.env.DISTRIBUTION_ID; // CloudFront distribution of SHARE_HOST
const DELETE_SECRET = process.env.DELETE_SECRET;     // HMAC key for delete tokens
const MAX_BYTES = 100 * 1024 * 1024;                 // 100 MB
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
const CONTENT_TYPE = 'application/x.scratch.sb3';
const ID_PATTERN = /^[A-Za-z0-9_-]{16}$/;
const META_MAX_BYTES = 4096;                          // sidecar JSON (project title etc.)

const s3 = new S3Client({});
const cloudfront = new CloudFrontClient({});

const json = (statusCode, body) => ({
    statusCode,
    headers: {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'},
    body: JSON.stringify(body)
});

// Only the browser that uploaded an object receives its token; it is derived from the id,
// so nothing has to be stored server side.
const deleteTokenFor = id => createHmac('sha256', DELETE_SECRET).update(id).digest('base64url');

const presign = async () => {
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
    // Sidecar JSON next to the .sb3 (project title etc.), same expiry, deleted together
    const metaKey = `sb3/${id}.json`;
    const meta = await createPresignedPost(s3, {
        Bucket: BUCKET,
        Key: metaKey,
        Conditions: [
            ['content-length-range', 1, META_MAX_BYTES],
            ['eq', '$Content-Type', 'application/json']
        ],
        Fields: {'Content-Type': 'application/json'},
        Expires: 600
    });
    return json(200, {
        id,
        uploadUrl: url,
        fields,
        metaUploadUrl: meta.url,
        metaFields: meta.fields,
        metaUrl: `${SHARE_HOST}/${metaKey}`,
        fileUrl: `${SHARE_HOST}/${key}`,
        editorUrl: `${SHARE_HOST}/e/${id}`,
        playerUrl: `${SHARE_HOST}/p/${id}`,
        deleteToken: deleteTokenFor(id),
        maxBytes: MAX_BYTES,
        expiresDays: 7
    });
};

const remove = async ({id, token}) => {
    if (typeof id !== 'string' || !ID_PATTERN.test(id) || typeof token !== 'string') {
        return json(400, {error: 'bad request'});
    }
    const expected = Buffer.from(deleteTokenFor(id));
    const given = Buffer.from(token);
    if (expected.length !== given.length || !timingSafeEqual(expected, given)) {
        return json(403, {error: 'invalid token'});
    }
    const keys = [`sb3/${id}.sb3`, `sb3/${id}.json`];
    await Promise.all(keys.map(Key => s3.send(new DeleteObjectCommand({Bucket: BUCKET, Key}))));
    // CloudFront may still hold cached copies: drop them so the URL stops working right away
    await cloudfront.send(new CreateInvalidationCommand({
        DistributionId: DISTRIBUTION_ID,
        InvalidationBatch: {
            CallerReference: `${id}-${Date.now()}`,
            Paths: {Quantity: keys.length, Items: keys.map(key => `/${key}`)}
        }
    }));
    return json(200, {deleted: true, id});
};

export const handler = async event => {
    const method = event.requestContext?.http?.method;
    if (method !== 'POST') return json(405, {error: 'method not allowed'});
    const origin = event.headers?.origin || '';
    if (!ALLOWED_ORIGINS.includes(origin)) return json(403, {error: 'origin not allowed'});

    let body = {};
    try {
        body = event.body ? JSON.parse(event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString() : event.body) : {};
    } catch {
        return json(400, {error: 'invalid json'});
    }
    if (body.action === 'delete') return remove(body);
    return presign();
};
