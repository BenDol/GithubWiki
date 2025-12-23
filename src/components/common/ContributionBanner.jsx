import React from 'react';
import PropTypes from 'prop-types';

/**
 * ContributionBanner Component (Framework)
 *
 * A stylized banner encouraging community contributions
 * Used on AI-generated pages to invite human input and corrections
 *
 * @param {Object} props
 * @param {string} props.type - Banner type (default: 'ai-generated')
 * @param {React.ReactNode} props.customTitle - Custom title override (string or JSX)
 * @param {React.ReactNode} props.customMessage - Custom message override (string or JSX)
 * @param {React.ReactNode} props.customFooter - Custom footer override (string or JSX)
 */
const ContributionBanner = ({
  type = 'ai-generated',
  customTitle,
  customMessage,
  customFooter
}) => {
  const bannerStyles = {
    container: {
      margin: '2rem 0',
      padding: '1.5rem',
      borderLeft: '4px solid #4a9eff',
      backgroundColor: 'rgba(74, 158, 255, 0.1)',
      borderRadius: '4px',
    },
    title: {
      margin: '0 0 0.75rem 0',
      fontSize: '1.1rem',
      fontWeight: 'bold',
      color: '#4a9eff',
    },
    message: {
      margin: '0.5rem 0',
      lineHeight: '1.6',
    },
    disclaimer: {
      margin: '0.5rem 0',
      lineHeight: '1.6',
      fontStyle: 'italic',
      opacity: 0.85,
    },
    footer: {
      margin: '0.75rem 0 0 0',
      fontSize: '0.875rem',
      fontStyle: 'italic',
      opacity: 0.7,
      paddingLeft: '1rem',
      borderLeft: '2px solid rgba(74, 158, 255, 0.3)',
    },
  };

  const defaultMessages = {
    'ai-generated': {
      title: '🤖 Community Contribution Opportunity',
      message: 'This page was ready for your valuable insight are you ready to become a contributor to the wiki?! We need your help to build comprehensive information.',
      footer: 'Your contributions help make this wiki better for everyone.',
    },
  };

  const content = defaultMessages[type] || defaultMessages['ai-generated'];

  return (
    <div style={bannerStyles.container}>
      <div style={bannerStyles.title}>{customTitle || content.title}</div>
      <div style={bannerStyles.message}>{customMessage || content.message}</div>
      {(customFooter || content.footer) && (
        <div style={bannerStyles.footer}>{customFooter || content.footer}</div>
      )}
    </div>
  );
};

ContributionBanner.propTypes = {
  type: PropTypes.string,
  customTitle: PropTypes.node,
  customMessage: PropTypes.node,
  customFooter: PropTypes.node,
};

export default ContributionBanner;
