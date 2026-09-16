import classNames from 'classnames';
import {FormattedMessage} from 'react-intl';
import PropTypes from 'prop-types';
import React from 'react';
import Button from '../button/button.jsx';

import styles from './share-button.css';

const ShareButton = ({
    className,
    inactive,
    isShared,
    onClick
}) => (
    <Button
        className={classNames(
            className,
            styles.shareButton,
            {
                [styles.shareButtonIsShared]: isShared,
                [styles.shareButtonInactive]: inactive // xcratch-st: grey until AkaDako is connected
            }
        )}
        onClick={onClick}
    >
        {isShared ? (
            <FormattedMessage
                defaultMessage="Shared"
                description="Label for shared project"
                id="gui.menuBar.isShared"
            />
        ) : (
            <FormattedMessage
                defaultMessage="Share"
                description="Label for project share button"
                id="gui.menuBar.share"
            />
        )}
    </Button>
);

ShareButton.propTypes = {
    className: PropTypes.string,
    inactive: PropTypes.bool, // xcratch-st
    isShared: PropTypes.bool,
    onClick: PropTypes.func
};

ShareButton.defaultProps = {
    onClick: () => {}
};

export default ShareButton;
