/*
 * xcratch-st: share the current project via https://share.699.jp
 *
 * Flow: ask the presign Lambda for a one-time S3 POST policy, upload the .sb3
 * straight to S3 with it, then build the short URL (/e/<id> or /p/<id>).
 * Objects expire after SHARE_EXPIRES_DAYS (S3 lifecycle rule).
 */
import {getEffectiveBpa} from './xcratch-st-bpa';

export const SHARE_PRESIGN_URL = 'https://7zwbsbbdghvisqk53gezhcmusq0kkjax.lambda-url.ap-northeast-1.on.aws/';
export const SHARE_HOST = 'https://share.699.jp';
export const SHARE_EXPIRES_DAYS = 7;

export const SHARE_MODE_EDITOR = 'editor';
export const SHARE_MODE_PLAYER = 'player';

// Error codes surfaced to the UI (translated there)
export const SHARE_ERROR_TOO_LARGE = 'tooLarge';
export const SHARE_ERROR_NETWORK = 'network';

/**
 * Whether a project id (URL hash value) points at a shared project.
 * @param {string|number|null} projectId - redux project id
 * @returns {boolean} true for https://share.699.jp/sb3/... URLs
 */
export const isSharedProjectUrl = projectId =>
    typeof projectId === 'string' && projectId.startsWith(`${SHARE_HOST}/sb3/`);

/**
 * Build the short URL, carrying the palette/stage state of the moment of sharing.
 * @param {string} base - https://share.699.jp/e/<id> or /p/<id>
 * @returns {string} short URL with ?bpa= (and ?ss= when present)
 */
const buildShortUrl = base => {
    const url = new URL(base);
    url.searchParams.set('bpa', getEffectiveBpa());
    const ss = new URLSearchParams(window.location.search).get('ss');
    if (ss) url.searchParams.set('ss', ss);
    return url.toString();
};

class ShareError extends Error {
    constructor (code, message) {
        super(message || code);
        this.code = code;
    }
}

/**
 * Upload the current project and return its share URL.
 * @param {VM} vm - scratch-vm instance
 * @param {string} mode - SHARE_MODE_EDITOR or SHARE_MODE_PLAYER
 * @returns {Promise<{id: string, url: string}>} share id and short URL
 */
export const shareProject = async (vm, mode) => {
    const blob = await vm.saveProjectSb3();

    let info;
    try {
        const res = await fetch(SHARE_PRESIGN_URL, {
            method: 'POST',
            headers: {'content-type': 'application/json'},
            body: JSON.stringify({mode, size: blob.size})
        });
        if (!res.ok) throw new Error(`presign ${res.status}`);
        info = await res.json();
    } catch (e) {
        throw new ShareError(SHARE_ERROR_NETWORK, e.message);
    }

    if (info.maxBytes && blob.size > info.maxBytes) {
        throw new ShareError(SHARE_ERROR_TOO_LARGE, `${blob.size} > ${info.maxBytes}`);
    }

    const form = new FormData();
    Object.keys(info.fields).forEach(key => form.append(key, info.fields[key]));
    form.append('file', blob, `${info.id}.sb3`);
    let upload;
    try {
        upload = await fetch(info.uploadUrl, {method: 'POST', body: form});
    } catch (e) {
        throw new ShareError(SHARE_ERROR_NETWORK, e.message);
    }
    if (!upload.ok) {
        // S3 answers 400 EntityTooLarge when the policy limit is exceeded
        const text = await upload.text().catch(() => '');
        if (/EntityTooLarge/.test(text)) throw new ShareError(SHARE_ERROR_TOO_LARGE, text);
        throw new ShareError(SHARE_ERROR_NETWORK, `upload ${upload.status}`);
    }

    const base = mode === SHARE_MODE_PLAYER ? info.playerUrl : info.editorUrl;
    return {id: info.id, url: buildShortUrl(base)};
};
