import React from 'react';

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  elevated?: boolean;
  active?: boolean;
  padding?: 'none' | 'sm' | 'md' | 'lg';
}

const padMap = {
  none: '',
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6 sm:p-7',
};

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  elevated = false,
  active = false,
  padding = 'md',
  className = '',
  ...rest
}) => {
  return (
    <div
      className={`rounded-2xl transition-colors duration-200 ${
        elevated ? 'royal-glass-elevated' : 'royal-glass'
      } ${active ? 'violet-glow border-[#C7A4FF]/60' : ''} ${padMap[padding]} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
};
