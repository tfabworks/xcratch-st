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
        defaultMessage: 'Share',
        description: 'Title of the share dialog'
    }
});

export const SHARE_PHASE_CONFIRM = 'confirm';
export const SHARE_PHASE_UPLOADING = 'uploading';
export const SHARE_PHASE_DONE = 'done';
export const SHARE_PHASE_ERROR = 'error';

/*
 * xcratch-st: share dialog.
 * Phase "confirm" is the first dialog (explanation + mode + cancel/execute);
 * "uploading", "done" and "error" are the second dialog.
 */
const ShareModalComponent = props => {
    const {
        copied,
        error,
        intl,
        mode,
        onCancel,
        onChangeMode,
        onCopy,
        onExecute,
        phase,
        qrDataUrl,
        url
    } = props;
    const busy = phase === SHARE_PHASE_UPLOADING;
    return (
        <Modal
            className={styles.modalContent}
            contentLabel={intl.formatMessage(messages.title)}
            id="xcratchStShare"
            onRequestClose={busy ? null : onCancel}
        >
            <Box className={styles.body}>
                {phase === SHARE_PHASE_CONFIRM ? (
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
                                        <img
                                            alt={url}
                                            className={styles.qrImage}
                                            src={qrDataUrl}
                                        />
                                    ) : null}
                                    <span className={styles.validDays}>
                                        <FormattedMessage
                                            defaultMessage="Valid for 7 days"
                                            description="Note under the QR code about the share expiry"
                                            id="xcratch-st.share.validDays"
                                        />
                                    </span>
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
    intl: intlShape.isRequired,
    mode: PropTypes.oneOf([SHARE_MODE_EDITOR, SHARE_MODE_PLAYER]).isRequired,
    onCancel: PropTypes.func.isRequired,
    onChangeMode: PropTypes.func.isRequired,
    onCopy: PropTypes.func.isRequired,
    onExecute: PropTypes.func.isRequired,
    phase: PropTypes.oneOf([
        SHARE_PHASE_CONFIRM, SHARE_PHASE_UPLOADING, SHARE_PHASE_DONE, SHARE_PHASE_ERROR
    ]).isRequired,
    qrDataUrl: PropTypes.string,
    url: PropTypes.string
};

ShareModalComponent.defaultProps = {
    copied: false,
    error: null,
    qrDataUrl: null,
    url: null
};

export default injectIntl(ShareModalComponent);
