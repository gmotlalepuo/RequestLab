export default function BrandLogo({ markOnly = false, light = false }: { markOnly?: boolean; light?: boolean }) {
  return <span className={`requestlab-logo ${markOnly ? 'mark-only' : 'lockup'} ${light ? 'logo-light' : ''}`} role="img" aria-label="RequestLab"><img src="/requestlab-logo.png" alt="" /></span>;
}
