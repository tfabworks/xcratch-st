import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, useIntl} from 'react-intl';

import connectedIcon from './icon--akadako-connected.svg';
import disconnectedIcon from './icon--akadako-disconnected.svg';
import styles from './akadako-indicator.css';

const messages = defineMessages({
    connected: {
        id: 'xcratch-st.akadako.connected',
        defaultMessage: 'AkaDako is connected',
        description: 'Tooltip of the AkaDako indicator when the board is connected'
    },
    disconnected: {
        id: 'xcratch-st.akadako.disconnected',
        defaultMessage: 'AkaDako is not connected (click to connect)',
        description: 'Tooltip of the AkaDako indicator when the board is not connected'
    }
});

/*
 * xcratch-st: indicator of the AkaDako (g2s extension) connection state.
 * Rendered only while the extension is loaded; see containers/akadako-indicator.jsx.
 */
const AkaDakoIndicatorComponent = function (props) {
    const {
        className,
        connected,
        onClick,
        ...componentProps
    } = props;
    const intl = useIntl();
    const title = intl.formatMessage(connected ? messages.connected : messages.disconnected);
    return (
        <img
            alt={title}
            className={classNames(className, styles.akadakoIndicator)}
            draggable={false}
            src={connected ? connectedIcon : disconnectedIcon}
            title={title}
            onClick={onClick}
            {...componentProps}
        />
    );
};

AkaDakoIndicatorComponent.propTypes = {
    className: PropTypes.string,
    connected: PropTypes.bool,
    onClick: PropTypes.func.isRequired
};

AkaDakoIndicatorComponent.defaultProps = {
    connected: false
};

export default AkaDakoIndicatorComponent;
