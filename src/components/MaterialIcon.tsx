import type { CSSProperties } from 'react';

export function MaterialIcon({
  name,
  filled = false,
  size,
  className = '',
  slot,
  title,
}: {
  name: string;
  filled?: boolean;
  size?: number | string;
  className?: string;
  slot?: string;
  title?: string;
}) {
  const style = { 
    '--icon-fill': filled ? 1 : 0,
    ...(size ? { fontSize: typeof size === 'number' ? `${size}px` : size } : {})
  } as CSSProperties;

  return (
    <span 
      className={`material-symbols-rounded ${className}`} 
      style={style} 
      aria-hidden="true" 
      slot={slot} 
      title={title}
    >
      {name}
    </span>
  );
}