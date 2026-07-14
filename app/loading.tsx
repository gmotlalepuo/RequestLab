import { LoaderCircle } from 'lucide-react';
import BrandLogo from '@/components/BrandLogo';

export default function Loading() {
  return <main className="route-loading" role="status" aria-live="polite">
    <BrandLogo />
    <LoaderCircle className="spin" size={30}/>
    <strong>Preparing RequestLab…</strong>
  </main>;
}
