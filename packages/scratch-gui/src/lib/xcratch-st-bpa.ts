/**
 * xcratch-st: ブロックパレット表示切替（?bpa=）の URL パラメータを扱うヘルパー。
 *
 * - 値の意味: '0' = 切替ボタン無し（常に表示）, '1' = ボタン有り（初期状態は表示）,
 *   '2' = ボタン有り（初期状態は非表示）。未指定は '1' 扱い。
 * - ローカル保存（IndexedDB）のヘッダーにも同じ値を持たせ、プロジェクト一覧から
 *   開くときに URL へ復元する。
 */

export const BPA_DEFAULT = '1';
export const BPA_CHANGED_EVENT = 'xcratch-st:bpa-changed';

// 現在の URL の bpa（未指定なら null）
export const getBpaFromUrl = (): string | null => {
    if (typeof window === 'undefined') return null;
    return new URLSearchParams(window.location.search).get('bpa');
};

// 未指定を既定値に解決した bpa
export const getEffectiveBpa = (): string => getBpaFromUrl() || BPA_DEFAULT;

// URL の bpa を差し替える（null で削除）。ページは再読み込みせず、
// 変更があれば Blocks コンポーネントへイベントで通知する。
export const setBpaInUrl = (bpa: string | null | undefined): void => {
    if (typeof window === 'undefined') return;
    const current = getBpaFromUrl();
    const next = bpa || null;
    if (current === next) return;
    const url = new URL(window.location.href);
    if (next) {
        url.searchParams.set('bpa', next);
    } else {
        url.searchParams.delete('bpa');
    }
    history.replaceState(history.state, '', url.toString());
    window.dispatchEvent(new Event(BPA_CHANGED_EVENT));
};
