import classNames from 'classnames';
import {defineMessages, FormattedMessage, injectIntl} from 'react-intl';
import PropTypes from 'prop-types';
import React from 'react';

import Box from '../box/box.jsx';
import Modal from '../../containers/modal.jsx';
import intlShape from '../../lib/intlShape.js';
import {
    SHARE_MODE_EDITOR,
    SHARE_MODE_PLAYER,
    SHARE_ERROR_TOO_LARGE
} from '../../lib/xcratch-st-share';

import styles from './share-modal.css';

const messages = defineMessages({
    title: {
        id: 'xcratch-st.share.title',
        defaultMessage: 'Cloud share',
        description: 'Title of the share dialog'
    }
});

export const SHARE_PHASE_CONFIRM = 'confirm';
export const SHARE_PHASE_UPLOADING = 'uploading';
export const SHARE_PHASE_DONE = 'done';
export const SHARE_PHASE_ERROR = 'error';
export const SHARE_PHASE_UNAVAILABLE = 'unavailable';

/*
 * xcratch-st: share dialog.
 * Phase "confirm" is the first dialog (explanation + mode + cancel/execute);
 * "uploading", "done" and "error" are the second dialog.
 */
const ShareModalComponent = props => {
    const {
        copied,
        error,
        expiresAt,
        intl,
        mode,
        myShares,
        onCancel,
        onChangeMode,
        onChangeTitle,
        onCopy,
        onCopyQr,
        onDeleteShare,
        onExecute,
        phase,
        qrCopyState,
        qrDataUrl,
        title,
        url
    } = props;
    const busy = phase === SHARE_PHASE_UPLOADING;
    const formatExpiry = date => intl.formatDate(date, {
        year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
    // Shares made from this browser, with a delete button each
    const myShareList = myShares && myShares.length > 0 ? (
        <Box className={styles.myShares}>
            <div className={styles.myShareTitle}>
                <FormattedMessage
                    defaultMessage="Programs shared to the cloud"
                    description="Heading of the list of shares made from this browser"
                    id="xcratch-st.share.myShares"
                />
            </div>
            <ul className={styles.myShareList}>
                {myShares.map(share => (
                    <li
                        className={styles.myShareItem}
                        key={share.id}
                    >
                        <a
                            className={styles.myShareUrl}
                            href={share.url}
                            rel="noopener noreferrer"
                            target="_blank"
                            title={share.url}
                        >
                            {share.title || share.url}
                        </a>
                        <span className={styles.myShareExpiry}>
                            <FormattedMessage
                                defaultMessage="Until {date}"
                                description="Exact local date and time the shared URL stays valid until"
                                id="xcratch-st.share.validUntil"
                                values={{date: formatExpiry(new Date(share.expiresAt))}}
                            />
                        </span>
                        <button
                            className={styles.copyButton}
                            data-id={share.id}
                            onClick={onDeleteShare}
                        >
                            <FormattedMessage
                                defaultMessage="Stop sharing"
                                description="Button that deletes a shared project from the cloud"
                                id="xcratch-st.share.delete"
                            />
                        </button>
                    </li>
                ))}
            </ul>
        </Box>
    ) : null;
    return (
        <Modal
            className={styles.modalContent}
            contentLabel={intl.formatMessage(messages.title)}
            id="xcratchStShare"
            onRequestClose={busy ? null : onCancel}
        >
            <Box className={styles.body}>
                {phase === SHARE_PHASE_UNAVAILABLE ? (
                    <React.Fragment>
                        <Box className={styles.description}>
                            <FormattedMessage
                                defaultMessage="Sharing is available only while an AkaDako board is connected."
                                description="Shown when the share button is used without a connected AkaDako"
                                id="xcratch-st.share.unavailable"
                            />
                        </Box>
                        {myShareList}
                        <Box className={styles.buttonRow}>
                            <button
                                className={styles.primaryButton}
                                onClick={onCancel}
                            >
                                <FormattedMessage
                                    defaultMessage="Close"
                                    description="Button that closes the share dialog"
                                    id="xcratch-st.share.close"
                                />
                            </button>
                        </Box>
                    </React.Fragment>
                ) : phase === SHARE_PHASE_CONFIRM ? (
                    <React.Fragment>
                        <Box className={styles.description}>
                            <FormattedMessage
                                defaultMessage={'Sharing uploads a copy of the current program to the cloud, and ' +
                                    'anyone who knows the URL can run it. The uploaded program is deleted ' +
                                    'after one week and the URL stops working.'}
                                description="Explanation shown before sharing a project"
                                id="xcratch-st.share.description"
                            />
                        </Box>
                        <Box className={styles.modeRow}>
                            <span>
                                <FormattedMessage
                                    defaultMessage="Mode"
                                    description="Label of the share mode radio buttons"
                                    id="xcratch-st.share.modeLabel"
                                />
                            </span>
                            <label>
                                <input
                                    checked={mode === SHARE_MODE_EDITOR}
                                    name="xcratch-st-share-mode"
                                    type="radio"
                                    value={SHARE_MODE_EDITOR}
                                    onChange={onChangeMode}
                                />
                                <FormattedMessage
                                    defaultMessage="Editor"
                                    description="Share mode: open the shared project in the editor"
                                    id="xcratch-st.share.modeEditor"
                                />
                            </label>
                            <label>
                                <input
                                    checked={mode === SHARE_MODE_PLAYER}
                                    name="xcratch-st-share-mode"
                                    type="radio"
                                    value={SHARE_MODE_PLAYER}
                                    onChange={onChangeMode}
                                />
                                <FormattedMessage
                                    defaultMessage="Player"
                                    description="Share mode: open the shared project in the player"
                                    id="xcratch-st.share.modePlayer"
                                />
                            </label>
                        </Box>
                        <Box className={styles.titleRow}>
                            <label
                                className={styles.titleLabel}
                                htmlFor="xcratch-st-share-title"
                            >
                                <FormattedMessage
                                    defaultMessage="Project name"
                                    description="Label of the project name field in the share dialog"
                                    id="xcratch-st.share.projectName"
                                />
                            </label>
                            <input
                                className={styles.titleInput}
                                id="xcratch-st-share-title"
                                maxLength={200}
                                type="text"
                                value={title}
                                onChange={onChangeTitle}
                            />
                            <Box className={styles.buttonRow}>
                                <button onClick={onCancel}>
                                    <FormattedMessage
                                        defaultMessage="Cancel"
                                        description="Button for cancelling the share dialog"
                                        id="xcratch-st.share.cancel"
                                    />
                                </button>
                                <button
                                    className={styles.primaryButton}
                                    onClick={onExecute}
                                >
                                    <FormattedMessage
                                        defaultMessage="Share now"
                                        description="Button for starting the upload"
                                        id="xcratch-st.share.execute"
                                    />
                                </button>
                            </Box>
                        </Box>
                        {myShareList}
                    </React.Fragment>
                ) : (
                    <React.Fragment>
                        {phase === SHARE_PHASE_UPLOADING ? (
                            <Box className={classNames(styles.status, styles.statusUploading)}>
                                <FormattedMessage
                                    defaultMessage="Uploading to the cloud..."
                                    description="Status shown while the project is being uploaded"
                                    id="xcratch-st.share.uploading"
                                />
                            </Box>
                        ) : null}
                        {phase === SHARE_PHASE_DONE ? (
                            <React.Fragment>
                                <Box className={classNames(styles.status, styles.statusDone)}>
                                    <FormattedMessage
                                        defaultMessage="Uploaded to the cloud"
                                        description="Status shown when the upload finished"
                                        id="xcratch-st.share.uploaded"
                                    />
                                </Box>
                                <Box className={styles.urlRow}>
                                    <a
                                        className={styles.urlLink}
                                        href={url}
                                        rel="noopener noreferrer"
                                        target="_blank"
                                    >
                                        {url}
                                    </a>
                                    <button
                                        className={styles.copyButton}
                                        onClick={onCopy}
                                    >
                                        {copied ? (
                                            <FormattedMessage
                                                defaultMessage="Copied"
                                                description="Copy button label after the URL was copied"
                                                id="xcratch-st.share.copied"
                                            />
                                        ) : (
                                            <FormattedMessage
                                                defaultMessage="Copy"
                                                description="Button that copies the share URL to the clipboard"
                                                id="xcratch-st.share.copy"
                                            />
                                        )}
                                    </button>
                                </Box>
                                <Box className={styles.qrBox}>
                                    {qrDataUrl ? (
                                        <React.Fragment>
                                            <img
                                                alt={url}
                                                className={styles.qrImage}
                                                src={qrDataUrl}
                                            />
                                            <button
                                                className={styles.copyButton}
                                                onClick={onCopyQr}
                                            >
                                                {qrCopyState === 'copied' ? (
                                                    <FormattedMessage
                                                        defaultMessage="Copied"
                                                        description="Copy button label after the URL was copied"
                                                        id="xcratch-st.share.copied"
                                                    />
                                                ) : qrCopyState === 'failed' ? (
                                                    <FormattedMessage
                                                        defaultMessage="Cannot copy"
                                                        description="Copy button label when copying failed"
                                                        id="xcratch-st.share.copyFailed"
                                                    />
                                                ) : (
                                                    <FormattedMessage
                                                        defaultMessage="Copy"
                                                        description="Button that copies the share URL to the clipboard"
                                                        id="xcratch-st.share.copy"
                                                    />
                                                )}
                                            </button>
                                        </React.Fragment>
                                    ) : null}
                                    <span className={styles.validDays}>
                                        <FormattedMessage
                                            defaultMessage="Valid for 7 days"
                                            description="Note under the QR code about the share expiry"
                                            id="xcratch-st.share.validDays"
                                        />
                                    </span>
                                    {expiresAt ? (
                                        <span className={styles.validUntil}>
                                            <FormattedMessage
                                                defaultMessage="Until {date}"
                                                description="Exact local date and time the shared URL stays valid until"
                                                id="xcratch-st.share.validUntil"
                                                values={{date: formatExpiry(expiresAt)}}
                                            />
                                        </span>
                                    ) : null}
                                </Box>
                            </React.Fragment>
                        ) : null}
                        {phase === SHARE_PHASE_ERROR ? (
                            <Box className={styles.errorMessage}>
                                {error === SHARE_ERROR_TOO_LARGE ? (
                                    <FormattedMessage
                                        defaultMessage={'The program is larger than the 100 MB limit ' +
                                            'and cannot be shared.'}
                                        description="Error shown when the project exceeds the share size limit"
                                        id="xcratch-st.share.errorTooLarge"
                                    />
                                ) : (
                                    <FormattedMessage
                                        defaultMessage="Upload failed. Check your network connection and try again."
                                        description="Error shown when the share upload failed"
                                        id="xcratch-st.share.errorNetwork"
                                    />
                                )}
                            </Box>
                        ) : null}
                        <Box className={styles.buttonRow}>
                            <button
                                className={styles.primaryButton}
                                disabled={busy}
                                onClick={onCancel}
                            >
                                <FormattedMessage
                                    defaultMessage="Close"
                                    description="Button that closes the share dialog"
                                    id="xcratch-st.share.close"
                                />
                            </button>
                        </Box>
                    </React.Fragment>
                )}
            </Box>
        </Modal>
    );
};

ShareModalComponent.propTypes = {
    copied: PropTypes.bool,
    error: PropTypes.string,
    expiresAt: PropTypes.instanceOf(Date),
    intl: intlShape.isRequired,
    mode: PropTypes.oneOf([SHARE_MODE_EDITOR, SHARE_MODE_PLAYER]).isRequired,
    myShares: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string,
        url: PropTypes.string,
        mode: PropTypes.string,
        expiresAt: PropTypes.number
    })),
    onCancel: PropTypes.func.isRequired,
    onChangeMode: PropTypes.func.isRequired,
    onChangeTitle: PropTypes.func.isRequired,
    onCopy: PropTypes.func.isRequired,
    onCopyQr: PropTypes.func.isRequired,
    onDeleteShare: PropTypes.func.isRequired,
    onExecute: PropTypes.func.isRequired,
    phase: PropTypes.oneOf([
        SHARE_PHASE_CONFIRM, SHARE_PHASE_UPLOADING, SHARE_PHASE_DONE, SHARE_PHASE_ERROR, SHARE_PHASE_UNAVAILABLE
    ]).isRequired,
    qrCopyState: PropTypes.oneOf(['idle', 'copied', 'failed']),
    qrDataUrl: PropTypes.string,
    title: PropTypes.string,
    url: PropTypes.string
};

ShareModalComponent.defaultProps = {
    copied: false,
    error: null,
    expiresAt: null,
    myShares: [],
    qrCopyState: 'idle',
    qrDataUrl: null,
    title: '',
    url: null
};

export default injectIntl(ShareModalComponent);
