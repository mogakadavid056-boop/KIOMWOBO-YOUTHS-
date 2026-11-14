import React from 'react';

interface RoyalEmblemProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
}

const sizeMap = {
  sm: 'w-8 h-8',
  md: 'w-11 h-11',
  lg: 'w-16 h-16',
  xl: 'w-24 h-24',
};

export const RoyalShieldLogo: React.FC<RoyalEmblemProps> = ({ size = 'md', className = '' }) => (
  <svg
    viewBox="0 0 120 120"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={`${sizeMap[size]} ${className}`}
    aria-hidden="true"
  >
    <defs>
      <linearGradient id="royalGoldGrad" x1="0" y1="0" x2="120" y2="120" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#F5D88A" />
        <stop offset="50%" stopColor="#D4AF37" />
        <stop offset="100%" stopColor="#A67C1E" />
      </linearGradient>
      <linearGradient id="royalShieldFill" x1="60" y1="12" x2="60" y2="108" gradientUnits="userSpaceOnUse">
        <stop offset="0%" stopColor="#31005F" stopOpacity="0.92" />
        <stop offset="100%" stopColor="#080610" stopOpacity="0.96" />
      </linearGradient>
    </defs>
    <path
      d="M60 10L102 28V59C102 85 83 104 60 111C37 104 18 85 18 59V28L60 10Z"
      fill="url(#royalShieldFill)"
      stroke="url(#royalGoldGrad)"
      strokeWidth="3.5"
      strokeLinejoin="round"
    />
    <path
      d="M36 53L41.5 34L53 44.5L60 30L67 44.5L78.5 34L84 53H36Z"
      fill="url(#royalGoldGrad)"
    />
    <rect x="36" y="56.5" width="48" height="4.5" rx="2.25" fill="url(#royalGoldGrad)" />
    <path
      d="M60 67V93M49 77H71"
      stroke="url(#royalGoldGrad)"
      strokeWidth="4.5"
      strokeLinecap="round"
    />
  </svg>
);

export const RoyalCrownIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
    <path
      d="M3 17L5 8L9.5 12L12 6L14.5 12L19 8L21 17H3Z"
      fill="url(#crownMiniGrad)"
      stroke="#F5D88A"
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
    <rect x="4" y="18.5" width="16" height="2" rx="1" fill="#D4AF37" />
    <defs>
      <linearGradient id="crownMiniGrad" x1="3" y1="6" x2="21" y2="18" gradientUnits="userSpaceOnUse">
        <stop stopColor="#F5D88A" />
        <stop offset="1" stopColor="#D4AF37" />
      </linearGradient>
    </defs>
  </svg>
);
