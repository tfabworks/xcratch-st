import React from 'react';
import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import {defineMessages, injectIntl} from 'react-intl';
import intlShape from '../lib/intlShape.js';
import SB3Downloader from './sb3-downloader.jsx';
import AlertComponent from '../components/alerts/alert.jsx';
import {openConnectionModal} from '../reducers/modals';
import {setConnectionModalExtensionId} from '../reducers/connection-modal';
import {manualUpdateProject} from '../reducers/project-state';
import {closeAlertWithId, showAlertWithTimeout} from '../reducers/alerts';
import {deleteShare, findMyShareByProjectId} from '../lib/xcratch-st-share';

// xcratch-st: share "stop sharing" confirmations
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

class Alert extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleOnCloseAlert',
            'handleOnReconnect',
            'handleOnStopSharing'
        ]);
    }
    handleOnCloseAlert () {
        this.props.onCloseAlert(this.props.index);
    }
    handleOnReconnect () {
        this.props.onOpenConnectionModal(this.props.extensionId);
        this.handleOnCloseAlert();
    }
    handleOnStopSharing () {
        // xcratch-st: delete the shared copy of the open project
        const share = findMyShareByProjectId(this.props.projectId);
        if (!share) {
            this.handleOnCloseAlert();
            return;
        }
        // eslint-disable-next-line no-alert
        if (!window.confirm(this.props.intl.formatMessage(messages.confirmDelete))) return;
        deleteShare(share.id).then(
            () => this.props.onShareStopped(),
            // eslint-disable-next-line no-alert
            () => window.alert(this.props.intl.formatMessage(messages.deleteFailed))
        );
    }
    render () {
        const {
            closeButton,
            content,
            extensionName,
            index,
            level,
            iconSpinner,
            iconURL,
            message,
            onSaveNow,
            showDownload,
            showReconnect,
            showSaveNow,
            showStopSharing
        } = this.props;
        return (
            <SB3Downloader>{(_, downloadProject) => (
                <AlertComponent
                    closeButton={closeButton}
                    content={content}
                    extensionName={extensionName}
                    iconSpinner={iconSpinner}
                    iconURL={iconURL}
                    level={level}
                    message={message}
                    showDownload={showDownload}
                    showReconnect={showReconnect}
                    showSaveNow={showSaveNow}
                    showStopSharing={showStopSharing}
                    onCloseAlert={this.handleOnCloseAlert}
                    onStopSharing={this.handleOnStopSharing}
                    onDownload={downloadProject}
                    onReconnect={this.handleOnReconnect}
                    onSaveNow={onSaveNow}
                />
            )}</SB3Downloader>
        );
    }
}

const mapStateToProps = state => ({
    projectId: state.scratchGui.projectState.projectId // xcratch-st
});

const mapDispatchToProps = dispatch => ({
    onOpenConnectionModal: id => {
        dispatch(setConnectionModalExtensionId(id));
        dispatch(openConnectionModal());
    },
    onSaveNow: () => {
        dispatch(manualUpdateProject());
    },
    onShareStopped: () => { // xcratch-st
        dispatch(closeAlertWithId('xcratchStOwnShare'));
        showAlertWithTimeout(dispatch, 'xcratchStShareStopped');
    }
});

Alert.propTypes = {
    closeButton: PropTypes.bool,
    content: PropTypes.element,
    extensionId: PropTypes.string,
    extensionName: PropTypes.string,
    iconSpinner: PropTypes.bool,
    iconURL: PropTypes.string,
    index: PropTypes.number,
    intl: intlShape.isRequired,
    level: PropTypes.string.isRequired,
    message: PropTypes.string,
    onCloseAlert: PropTypes.func.isRequired,
    onOpenConnectionModal: PropTypes.func,
    onSaveNow: PropTypes.func,
    onShareStopped: PropTypes.func,
    projectId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    showDownload: PropTypes.bool,
    showReconnect: PropTypes.bool,
    showSaveNow: PropTypes.bool,
    showStopSharing: PropTypes.bool
};

export default injectIntl(connect(
    mapStateToProps,
    mapDispatchToProps
)(Alert));
