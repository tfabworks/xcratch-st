import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import VM from '@scratch/scratch-vm';
import {connect} from 'react-redux';

import AkaDakoIndicatorComponent from '../components/akadako-indicator/akadako-indicator.jsx';
import {openConnectionModal} from '../reducers/modals';
import {setConnectionModalExtensionId} from '../reducers/connection-modal';
import {AKADAKO_EXTENSION_ID, watchAkaDakoStatus} from '../lib/xcratch-st-akadako-status';

/*
 * xcratch-st: shows the AkaDako indicator next to the stop button while the
 * extension is loaded. Clicking it opens the same connection modal as the
 * palette status button.
 */
class AkaDakoIndicator extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleClick',
            'handleStatus'
        ]);
        this.state = {
            loaded: false,
            connected: false
        };
        this.unwatch = null;
    }
    componentDidMount () {
        this.unwatch = watchAkaDakoStatus(this.props.vm, this.handleStatus);
    }
    componentWillUnmount () {
        if (this.unwatch) this.unwatch();
        this.unwatch = null;
    }
    handleStatus (status) {
        this.setState(status);
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
