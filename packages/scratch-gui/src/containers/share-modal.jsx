import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import VM from '@scratch/scratch-vm';
import {connect} from 'react-redux';
import QRCode from 'qrcode';

import ShareModalComponent, {
    SHARE_PHASE_CONFIRM,
    SHARE_PHASE_UPLOADING,
    SHARE_PHASE_DONE,
    SHARE_PHASE_ERROR,
    SHARE_PHASE_UNAVAILABLE
} from '../components/share-modal/share-modal.jsx';
import {getAkaDakoStatus} from '../lib/xcratch-st-akadako-status';
import {closeShareModal} from '../reducers/modals';
import {shareProject, SHARE_MODE_EDITOR, SHARE_EXPIRES_DAYS} from '../lib/xcratch-st-share';
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
            'handleCopy',
            'handleCopyQr',
            'handleExecute'
        ]);
        this.state = {
            // Sharing (and its AWS cost) is reserved for AkaDako users: require a connected board
            phase: getAkaDakoStatus(props.vm).connected ? SHARE_PHASE_CONFIRM : SHARE_PHASE_UNAVAILABLE,
            mode: SHARE_MODE_EDITOR,
            url: null,
            qrDataUrl: null,
            expiresAt: null,
            error: null,
            copied: false,
            qrCopyState: 'idle'
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
    handleCancel () {
        if (this.state.phase === SHARE_PHASE_UPLOADING) return;
        this.props.onClose();
    }
    async handleExecute () {
        this.setState({phase: SHARE_PHASE_UPLOADING, error: null});
        try {
            const {url} = await shareProject(this.props.vm, this.state.mode);
            let qrDataUrl = null;
            try {
                qrDataUrl = await QRCode.toDataURL(url, {width: 192, margin: 1, errorCorrectionLevel: 'M'});
            } catch (qrError) {
                log.warn('QR code generation failed', qrError);
            }
            if (this.unmounted) return;
            // The object is deleted by the S3 lifecycle rule no earlier than this
            const expiresAt = new Date(Date.now() + (SHARE_EXPIRES_DAYS * 24 * 60 * 60 * 1000));
            this.setState({phase: SHARE_PHASE_DONE, url, qrDataUrl, expiresAt});
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
                phase={this.state.phase}
                qrCopyState={this.state.qrCopyState}
                qrDataUrl={this.state.qrDataUrl}
                url={this.state.url}
                onCancel={this.handleCancel}
                onChangeMode={this.handleChangeMode}
                onCopy={this.handleCopy}
                onCopyQr={this.handleCopyQr}
                onExecute={this.handleExecute}
            />
        );
    }
}

ShareModal.propTypes = {
    onClose: PropTypes.func.isRequired,
    vm: PropTypes.instanceOf(VM).isRequired
};

const mapDispatchToProps = dispatch => ({
    onClose: () => dispatch(closeShareModal())
});

export default connect(null, mapDispatchToProps)(ShareModal);
