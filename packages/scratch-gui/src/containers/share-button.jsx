import bindAll from 'lodash.bindall';
import PropTypes from 'prop-types';
import React from 'react';
import VM from '@scratch/scratch-vm';

import ShareButton from '../components/menu-bar/share-button.jsx';
import {watchAkaDakoStatus} from '../lib/xcratch-st-akadako-status';

/*
 * xcratch-st: the menu-bar share button. Orange (usable) while an AkaDako
 * board is connected, grey otherwise; the click handler is always called and
 * the share dialog explains when sharing is unavailable.
 */
class XcratchShareButton extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, ['handleStatus']);
        this.state = {connected: false};
        this.unwatch = null;
    }
    componentDidMount () {
        this.unwatch = watchAkaDakoStatus(this.props.vm, this.handleStatus);
    }
    componentWillUnmount () {
        if (this.unwatch) this.unwatch();
        this.unwatch = null;
    }
    handleStatus ({connected}) {
        this.setState({connected});
    }
    render () {
        return (
            <ShareButton
                className={this.props.className}
                inactive={!this.state.connected}
                onClick={this.props.onClick}
            />
        );
    }
}

XcratchShareButton.propTypes = {
    className: PropTypes.string,
    onClick: PropTypes.func.isRequired,
    vm: PropTypes.instanceOf(VM).isRequired
};

export default XcratchShareButton;
