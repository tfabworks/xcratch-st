import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import VM from '@scratch/scratch-vm';
import {connect} from 'react-redux';
import {defineMessages, injectIntl} from 'react-intl';
import QRCode from 'qrcode';

import intlShape from '../lib/intlShape.js';

import ShareModalComponent, {
    SHARE_PHASE_CONFIRM,
    SHARE_PHASE_UPLOADING,
    SHARE_PHASE_DONE,
    SHARE_PHASE_ERROR,
    SHARE_PHASE_UNAVAILABLE
} from '../components/share-modal/share-modal.jsx';
import {getAkaDakoStatus} from '../lib/xcratch-st-akadako-status';
import {closeShareModal} from '../reducers/modals';
import {shareProject, deleteShare, listMyShares, SHARE_MODE_EDITOR} from '../lib/xcratch-st-share';

const messages = defineMessages({
    confirmDelete: {
        id: 'xcratch-st.share.confirmDelete',
        defaultMessage: 'If you stop sharing, this URL will no longer open. Continue?',
        description: 'Confirmation before deleting a shared project from the cloud'
    },
    deleteFailed: {
        id: 'xcratch-st.share.deleteFailed',
        defaultMessage: 'Delete failed. Check your network connection and try again.',
        description: 'Error shown when deleting a shared project failed'
    }
});
import log from '../lib/log.js';

/*
 * xcratch-st: drives the share dialog (confirm -> uploading -> done / error).
 */
class ShareModal extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleCancel',
            'handleChangeMode',
            'handleChangeTitle',
            'handleCopy',
            'handleCopyQr',
            'handleDeleteShare',
            'handleExecute'
        ]);
        this.state = {
            // Sharing (and its AWS cost) is reserved for AkaDako users: require a connected board
            phase: getAkaDakoStatus(props.vm).connected ? SHARE_PHASE_CONFIRM : SHARE_PHASE_UNAVAILABLE,
            mode: SHARE_MODE_EDITOR,
            title: props.projectTitle || '',
            url: null,
            qrDataUrl: null,
            expiresAt: null,
            error: null,
            copied: false,
            qrCopyState: 'idle',
            myShares: listMyShares()
        };
        this.unmounted = false;
        this.copiedTimer = null;
        this.qrCopiedTimer = null;
    }
    componentWillUnmount () {
        this.unmounted = true;
        clearTimeout(this.copiedTimer);
        clearTimeout(this.qrCopiedTimer);
    }
    handleChangeMode (e) {
        this.setState({mode: e.target.value});
    }
    handleChangeTitle (e) {
        this.setState({title: e.target.value});
    }
    handleCancel () {
        if (this.state.phase === SHARE_PHASE_UPLOADING) return;
        this.props.onClose();
    }
    async handleExecute () {
        this.setState({phase: SHARE_PHASE_UPLOADING, error: null});
        try {
            const {url, expiresAt} = await shareProject(this.props.vm, this.state.mode, this.state.title);
            let qrDataUrl = null;
            try {
                qrDataUrl = await QRCode.toDataURL(url, {width: 192, margin: 1, errorCorrectionLevel: 'M'});
            } catch (qrError) {
                log.warn('QR code generation failed', qrError);
            }
            if (this.unmounted) return;
            this.setState({phase: SHARE_PHASE_DONE, url, qrDataUrl, expiresAt, myShares: listMyShares()});
        } catch (error) {
            log.warn('Share failed', error);
            if (this.unmounted) return;
            this.setState({phase: SHARE_PHASE_ERROR, error: error.code || 'network'});
        }
    }
    handleCopy () {
        const {url} = this.state;
        if (!url) return;
        const done = () => {
            this.setState({copied: true});
            clearTimeout(this.copiedTimer);
            this.copiedTimer = setTimeout(() => {
                if (!this.unmounted) this.setState({copied: false});
            }, 2000);
        };
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(url).then(done, () => this.copyFallback(url, done));
        } else {
            this.copyFallback(url, done);
        }
    }
    handleDeleteShare (e) {
        const id = e.currentTarget.dataset.id;
        // eslint-disable-next-line no-alert
        if (!window.confirm(this.props.intl.formatMessage(messages.confirmDelete))) return;
        deleteShare(id).then(
            () => {
                if (!this.unmounted) this.setState({myShares: listMyShares()});
            },
            () => {
                // eslint-disable-next-line no-alert
                window.alert(this.props.intl.formatMessage(messages.deleteFailed));
            }
        );
    }
    handleCopyQr () {
        const {qrDataUrl} = this.state;
        if (!qrDataUrl) return;
        const show = qrCopyState => {
            if (this.unmounted) return;
            this.setState({qrCopyState});
            clearTimeout(this.qrCopiedTimer);
            this.qrCopiedTimer = setTimeout(() => {
                if (!this.unmounted) this.setState({qrCopyState: 'idle'});
            }, 2000);
        };
        // Decode the PNG data URL synchronously so the clipboard write stays inside the click gesture
        let blob;
        try {
            const base64 = qrDataUrl.split(',')[1];
            const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
            blob = new Blob([bytes], {type: 'image/png'});
        } catch (e) {
            log.warn('QR decode failed', e);
            show('failed');
            return;
        }
        if (!(navigator.clipboard && navigator.clipboard.write && typeof window.ClipboardItem === 'function')) {
            show('failed');
            return;
        }
        navigator.clipboard.write([new window.ClipboardItem({'image/png': blob})])
            .then(() => show('copied'), e => {
                log.warn('QR copy failed', e);
                show('failed');
            });
    }
    copyFallback (text, done) {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
            document.execCommand('copy');
            done();
        } catch (e) {
            log.warn('Copy failed', e);
        }
        document.body.removeChild(textarea);
    }
    render () {
        return (
            <ShareModalComponent
                copied={this.state.copied}
                error={this.state.error}
                expiresAt={this.state.expiresAt}
                mode={this.state.mode}
                myShares={this.state.myShares}
                phase={this.state.phase}
                qrCopyState={this.state.qrCopyState}
                qrDataUrl={this.state.qrDataUrl}
                title={this.state.title}
                url={this.state.url}
                onCancel={this.handleCancel}
                onChangeMode={this.handleChangeMode}
                onChangeTitle={this.handleChangeTitle}
                onCopy={this.handleCopy}
                onCopyQr={this.handleCopyQr}
                onDeleteShare={this.handleDeleteShare}
                onExecute={this.handleExecute}
            />
        );
    }
}

ShareModal.propTypes = {
    intl: intlShape.isRequired,
    onClose: PropTypes.func.isRequired,
    projectTitle: PropTypes.string,
    vm: PropTypes.instanceOf(VM).isRequired
};

const mapStateToProps = state => ({
    projectTitle: state.scratchGui.projectTitle
});

const mapDispatchToProps = dispatch => ({
    onClose: () => dispatch(closeShareModal())
});

export default injectIntl(connect(mapStateToProps, mapDispatchToProps)(ShareModal));
