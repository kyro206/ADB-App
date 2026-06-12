import type { CSSProperties } from 'react';

export function MaterialIcon({
  name,
  filled = false,
  size,
  className = '',
  slot,
  title,
  style: customStyle,
}: {
  name: string;
  filled?: boolean;
  size?: number | string;
  className?: string;
  slot?: string;
  title?: string;
  style?: CSSProperties;
}) {
  const style = { 
    fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' 24`,
    ...(size ? { fontSize: typeof size === 'number' ? `${size}px` : size } : {}),
    ...customStyle
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