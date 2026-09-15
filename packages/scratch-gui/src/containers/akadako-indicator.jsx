import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import VM from '@scratch/scratch-vm';
import {connect} from 'react-redux';

import AkaDakoIndicatorComponent from '../components/akadako-indicator/akadako-indicator.jsx';
import {openConnectionModal} from '../reducers/modals';
import {setConnectionModalExtensionId} from '../reducers/connection-modal';

// Extension ID of the AkaDako extension (xcx-g2s)
const AKADAKO_EXTENSION_ID = 'g2s';

// Fallback polling interval; the extension emits PERIPHERAL_* events on
// connect/disconnect, but the poll keeps the icon right even if one is missed.
const POLL_INTERVAL_MS = 2000;

/*
 * xcratch-st: tracks whether the AkaDako extension is loaded and whether the
 * board is connected, and shows the indicator next to the stop button.
 * Clicking it opens the same connection modal as the palette status button.
 */
class AkaDakoIndicator extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleClick',
            'updateState'
        ]);
        this.state = {
            loaded: false,
            connected: false
        };
        this.pollTimer = null;
    }
    componentDidMount () {
        const {vm} = this.props;
        vm.on('EXTENSION_ADDED', this.updateState);
        vm.on('PERIPHERAL_CONNECTED', this.updateState);
        vm.on('PERIPHERAL_DISCONNECTED', this.updateState);
        vm.on('PERIPHERAL_CONNECTION_LOST_ERROR', this.updateState);
        vm.on('PERIPHERAL_REQUEST_ERROR', this.updateState);
        this.pollTimer = setInterval(this.updateState, POLL_INTERVAL_MS);
        this.updateState();
    }
    componentWillUnmount () {
        const {vm} = this.props;
        vm.removeListener('EXTENSION_ADDED', this.updateState);
        vm.removeListener('PERIPHERAL_CONNECTED', this.updateState);
        vm.removeListener('PERIPHERAL_DISCONNECTED', this.updateState);
        vm.removeListener('PERIPHERAL_CONNECTION_LOST_ERROR', this.updateState);
        vm.removeListener('PERIPHERAL_REQUEST_ERROR', this.updateState);
        clearInterval(this.pollTimer);
        this.pollTimer = null;
    }
    updateState () {
        const {vm} = this.props;
        let loaded = false;
        let connected = false;
        try {
            loaded = !!vm.extensionManager?.isExtensionLoaded(AKADAKO_EXTENSION_ID);
            connected = loaded && !!vm.getPeripheralIsConnected(AKADAKO_EXTENSION_ID);
        } catch {
            // The extension may not be registered yet; treat as not loaded.
        }
        if (loaded !== this.state.loaded || connected !== this.state.connected) {
            this.setState({loaded, connected});
        }
    }
    handleClick (e) {
        e.preventDefault();
        this.props.onOpenConnectionModal(AKADAKO_EXTENSION_ID);
    }
    render () {
        if (!this.state.loaded) return null;
        return (
            <AkaDakoIndicatorComponent
                className={this.props.className}
                connected={this.state.connected}
                onClick={this.handleClick}
            />
        );
    }
}

AkaDakoIndicator.propTypes = {
    className: PropTypes.string,
    onOpenConnectionModal: PropTypes.func.isRequired,
    vm: PropTypes.instanceOf(VM).isRequired
};

const mapDispatchToProps = dispatch => ({
    onOpenConnectionModal: id => {
        dispatch(setConnectionModalExtensionId(id));
        dispatch(openConnectionModal());
    }
});

export default connect(null, mapDispatchToProps)(AkaDakoIndicator);
