export function Icon({
  name,
  size = 20,
  className = "",
}: {
  name:
    | "shield"
    | "search"
    | "copy"
    | "check"
    | "wallet"
    | "eye"
    | "link"
    | "info"
    | "bell"
    | "external"
    | "lock";
  size?: number;
  className?: string;
}) {
  const paths = {
    shield: (
      <>
        <path d="M12 3 4.5 6v5.5c0 4 3 7.5 7.5 9.5 4.5-2 7.5-5.5 7.5-9.5V6L12 3Z" />
        <path d="m8.5 11.5 2.5 2.5 4.5-5" />
      </>
    ),
    search: (
      <>
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m16 16 4 4" />
      </>
    ),
    copy: (
      <>
        <rect x="8" y="8" width="12" height="13" rx="2" />
        <path d="M15 8V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h4" />
      </>
    ),
    check: <path d="m5 12 4 4L19 6" />,
    wallet: (
      <>
        <path d="M20 8H5a2 2 0 0 1 0-4h13v4M5 4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h15V8" />
        <path d="M20 12h-5v4h5" />
      </>
    ),
    eye: (
      <>
        <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ),
    link: (
      <>
        <path d="m10 13 4-4m-6 6-1.5 1.5a3.5 3.5 0 0 1-5-5L6 7a3.5 3.5 0 0 1 5 0m2 10a3.5 3.5 0 0 0 5 0l4.5-4.5a3.5 3.5 0 0 0-5-5L16 9" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v6m0-10v.2" />
      </>
    ),
    bell: (
      <>
        <path d="M5 17h14l-2-4V9A5 5 0 0 0 7 9v4l-2 4Zm5 3h4" />
      </>
    ),
    external: (
      <>
        <path d="M14 3h7v7m0-7L10 14m0-10H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-5" />
      </>
    ),
    lock: (
      <>
        <rect x="5" y="10" width="14" height="11" rx="2" />
        <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
      </>
    ),
  };
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
