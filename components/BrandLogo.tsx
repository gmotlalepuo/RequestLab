type BrandLogoProps = {
  markOnly?: boolean;
  light?: boolean;
};

export default function BrandLogo({
  markOnly = false,
  light = false,
}: BrandLogoProps) {
  return (
    <span
      className={`requestlab-logo ${markOnly ? "mark-only" : "lockup"} ${light ? "logo-light" : ""}`}
      role="img"
      aria-label="RequestLab"
    >
      <svg
        className="requestlab-mark"
        viewBox="0 0 48 48"
        aria-hidden="true"
        focusable="false"
      >
        <path className="mark-flask" d="M19 7h10M21 7v9L12.7 31.1A6.7 6.7 0 0 0 18.6 41h10.8a6.7 6.7 0 0 0 5.9-9.9L27 16V7" />
        <path className="mark-liquid" d="M15.8 30.5c4.1-1.8 7.2 2.1 11.1.2 2.2-1.1 4-.5 5.6.4l1.7 3.2a4.7 4.7 0 0 1-4.2 6.8H18a4.7 4.7 0 0 1-4.2-6.8l2-3.8Z" />
        <path className="mark-route" d="M4 15h8l3 4h4M4 25h8" />
        <circle className="mark-node" cx="4" cy="15" r="2.4" />
        <circle className="mark-node" cx="4" cy="25" r="2.4" />
        <circle className="mark-bubble" cx="24" cy="27" r="1.6" />
        <circle className="mark-bubble" cx="27.5" cy="23" r="1.2" />
        <path className="mark-arrow" d="m35 17 6 6-6 6M40.5 23H31" />
      </svg>
      {!markOnly && (
        <span className="requestlab-wordmark" aria-hidden="true">
          <span>Request</span><strong>Lab</strong>
        </span>
      )}
    </span>
  );
}
