import React from 'react';

interface AppIconProps {
  className?: string;
  size?: number;
}

const AppIcon: React.FC<AppIconProps> = ({ className = '', size = 32 }) => {
  return (
    <div 
      className={`relative flex items-center justify-center shrink-0 overflow-hidden rounded-lg bg-slate-900 ${className}`}
      style={{ width: size, height: size }}
    >
      <img 
        src="/icon.svg" 
        alt="Solution Agent Logo" 
        className="w-full h-full object-contain p-1"
      />
    </div>
  );
};

export default AppIcon;
