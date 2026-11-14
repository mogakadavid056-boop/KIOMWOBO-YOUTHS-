import React from 'react';
import { RoyalShieldLogo } from './RoyalEmblem';

interface LoadingScreenProps {
  message?: string;
}

export const LoadingScreen: React.FC<LoadingScreenProps> = ({
  message = 'Preparing the Royal Palace...',
}) => {
  return (
    <div className="min-h-dvh w-full bg-canvas-profile relative flex flex-col items-center justify-center px-6 text-center overflow-hidden">
      <div className="absolute inset-0 bg-[#080610]/45 pointer-events-none" />

      {/* Positioned to sit inside the glowing golden circle area of bg-profile.png */}
      <div className="relative z-10 flex flex-col items-center">
        <div className="w-36 h-36 rounded-full flex items-center justify-center border border-[#D4AF37]/50 bg-[#080610]/55 backdrop-blur-md shadow-[0_0_45px_rgba(212,175,55,0.32)]">
          <RoyalShieldLogo size="xl" />
        </div>

        <h1 className="mt-8 font-royal-display text-2xl sm:text-3xl font-bold tracking-wider text-gold-gradient text-balance">
          KIOMWOBO YOUTHS
        </h1>
        <p className="mt-2 font-royal-ui text-xs tracking-[0.2em] uppercase text-[#C7A4FF]">
          Kiomwobo District · Seventh-day Adventist
        </p>

        <div className="mt-8 w-52 h-1.5 rounded-full bg-white/10 overflow-hidden border border-[#D4AF37]/25">
          <div className="h-full w-1/2 rounded-full bg-gradient-to-r from-[#8B24FF] via-[#F5D88A] to-[#D4AF37] animate-[pulse_1.4s_ease-in-out_infinite]" />
        </div>
        <p className="mt-3 text-sm text-[#F5F1FF]/80 font-royal-body">{message}</p>
      </div>
    </div>
  );
};
