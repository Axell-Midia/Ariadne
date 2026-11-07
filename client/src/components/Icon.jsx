export default function Icon({ path, size = 1, className = '', ...rest }) {
  const px = typeof size === 'number' ? size * 24 : size
  return (
    <svg
      viewBox="0 0 24 24"
      width={px}
      height={px}
      className={className}
      fill="currentColor"
      aria-hidden="true"
      {...rest}
    >
      <path d={path} />
    </svg>
  )
}