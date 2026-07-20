"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";
import {
  ArrowRight,
  Braces,
  Check,
  ChevronRight,
  Clock3,
  Code2,
  FolderTree,
  Layers3,
  LockKeyhole,
  MousePointer2,
  Send,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import BrandLogo from "@/components/BrandLogo";
import ThemeToggle from "@/components/ThemeToggle";

const features = [
  {
    icon: <Send />,
    number: "01",
    title: "Send with confidence",
    text: "Methods, parameters, headers, bodies, and authentication stay together in one focused request builder.",
  },
  {
    icon: <FolderTree />,
    number: "02",
    title: "Structure every API",
    text: "Workspaces, collections, nested folders, stars, and drag-and-drop keep large endpoint libraries navigable.",
  },
  {
    icon: <Braces />,
    number: "03",
    title: "Read responses faster",
    text: "Syntax-aware JSON, status, timing, size, headers, and copy actions surface exactly what matters.",
  },
  {
    icon: <LockKeyhole />,
    number: "04",
    title: "Collaborate safely",
    text: "Invite teammates while Supabase authentication and row-level policies isolate every workspace.",
  },
];

export default function LandingExperience() {
  const rootRef = useRef<HTMLElement>(null);

  const rotateGlobe = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    event.currentTarget.style.setProperty("--globe-ry", `${x * 20}deg`);
    event.currentTarget.style.setProperty("--globe-rx", `${y * -14}deg`);
    event.currentTarget.style.setProperty("--globe-light-x", `${(x + 0.5) * 100}%`);
    event.currentTarget.style.setProperty("--globe-light-y", `${(y + 0.5) * 100}%`);
  };

  const resetGlobe = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.style.setProperty("--globe-ry", "0deg");
    event.currentTarget.style.setProperty("--globe-rx", "0deg");
  };

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const finePointer = window.matchMedia("(pointer: fine)").matches;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (!finePointer || reduceMotion) return;

    const move = (event: PointerEvent) => {
      const x = event.clientX;
      const y = event.clientY;
      root.style.setProperty("--cursor-x", `${x}px`);
      root.style.setProperty("--cursor-y", `${y}px`);
      root.style.setProperty("--scene-x", `${(x / innerWidth - 0.5) * 12}px`);
      root.style.setProperty("--scene-y", `${(y / innerHeight - 0.5) * 9}px`);
    };
    window.addEventListener("pointermove", move, { passive: true });
    return () => window.removeEventListener("pointermove", move);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !("IntersectionObserver" in window)) return;
    const items = root.querySelectorAll<HTMLElement>("[data-reveal]");
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.setAttribute("data-visible", "true");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14 },
    );
    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, []);

  return (
    <main className="landing landing-next" ref={rootRef}>
      <div className="cursor-aura" aria-hidden="true" />
      <nav className="landing-nav landing-nav-next">
        <Link className="brand dark" href="/" aria-label="RequestLab home">
          <BrandLogo />
        </Link>
        <div className="landing-links">
          <a href="#platform">Platform</a>
          <a href="#workflow">Workflow</a>
          <ThemeToggle />
        </div>
      </nav>

      <section className="hero hero-next">
        <div className="hero-atmosphere" aria-hidden="true" />
        <div className="hero-copy" data-reveal data-visible="true">
          <span className="hero-pill">
            <Sparkles size={14} /> Your API workbench, refined
          </span>
          <h1>
            Move from request
            <span>to insight.</span>
          </h1>
          <p>
            Build, organize, send, and inspect HTTP requests in a collaborative
            workspace engineered to keep you in flow.
          </p>
          <div className="hero-actions">
            <Link className="hero-primary" href="/auth">
              Get started <ArrowRight size={18} />
            </Link>
            <a className="hero-secondary" href="#platform">
              Explore the platform <ChevronRight size={16} />
            </a>
          </div>
          <div className="hero-proof">
            <span><Check size={14} /> Free to start</span>
            <span><ShieldCheck size={14} /> RLS protected</span>
            <span><Zap size={14} /> Built for speed</span>
          </div>
        </div>

        <div
          className="hero-tech-scene constellation-scene"
          data-reveal
          data-visible="true"
          onPointerMove={rotateGlobe}
          onPointerLeave={resetGlobe}
        >
          <Image
            src="/requestlab-api-constellation.webp"
            alt="Interactive constellation globe surrounded by API endpoint requests"
            fill
            priority
            sizes="(max-width: 900px) 100vw, 58vw"
          />
          <div className="floating-request floating-request-a constellation-chip">
            <span className="method-get">GET</span>
            <span>/v1/customers</span>
            <strong>200</strong>
          </div>
          <div className="floating-request floating-request-b constellation-chip">
            <Code2 size={14} />
            <span>JSON response</span>
            <small>184 ms</small>
          </div>
          <div className="scene-cursor" aria-hidden="true">
            <MousePointer2 size={19} />
          </div>
        </div>
      </section>

      <section className="signal-strip" aria-label="RequestLab capabilities">
        <span><Send size={15} /> Request builder</span>
        <span><Layers3 size={15} /> Nested collections</span>
        <span><Clock3 size={15} /> Response timing</span>
        <span><Code2 size={15} /> cURL generation</span>
        <span><ShieldCheck size={15} /> Secure collaboration</span>
      </section>

      <section className="platform-section" id="platform">
        <div className="section-intro" data-reveal>
          <span className="section-kicker">A calmer way to work</span>
          <h2>Everything important. Nothing in your way.</h2>
          <p>
            Familiar enough to start immediately, considered enough to make
            the work feel lighter.
          </p>
        </div>
        <div className="feature-grid feature-grid-next">
          {features.map((feature) => (
            <Feature key={feature.title} {...feature} />
          ))}
        </div>
      </section>

      <section className="workflow-section" id="workflow" data-reveal>
        <div className="workflow-copy">
          <span className="section-kicker">One continuous workflow</span>
          <h2>Your API context stays connected.</h2>
          <p>
            Variables flow into requests. Requests stay inside collections.
            Responses remain close enough to compare, copy, and act on.
          </p>
          <ul>
            <li><Check size={16} /> Collection-scoped environments</li>
            <li><Check size={16} /> Postman-compatible exports</li>
            <li><Check size={16} /> Responsive desktop and mobile workspace</li>
          </ul>
        </div>
        <div className="workflow-visual" aria-label="Request workflow preview">
          <div className="workflow-node"><span>01</span><strong>Organize</strong><small>Workspace / Collection</small></div>
          <i />
          <div className="workflow-node active"><span>02</span><strong>Send</strong><small>POST /v1/orders</small></div>
          <i />
          <div className="workflow-node"><span>03</span><strong>Inspect</strong><small>201 Created · 212 ms</small></div>
        </div>
      </section>

      <section className="landing-final" data-reveal>
        <div>
          <span className="section-kicker">Ready when you are</span>
          <h2>Give your APIs a better place to live.</h2>
        </div>
        <Link className="hero-primary" href="/auth">
          Get started <ArrowRight size={18} />
        </Link>
      </section>

      <footer className="landing-footer-next">
        <Link className="brand dark" href="/" aria-label="RequestLab home">
          <BrandLogo />
        </Link>
        <span>Purpose-built for better API work.</span>
        <Link href="/auth">Get started <ArrowRight size={14} /></Link>
      </footer>
    </main>
  );
}

function Feature({
  icon,
  number,
  title,
  text,
}: {
  icon: React.ReactNode;
  number: string;
  title: string;
  text: string;
}) {
  const tilt = (event: React.PointerEvent<HTMLElement>) => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty(
      "--card-x",
      `${(event.clientX - rect.left) / rect.width}`,
    );
    event.currentTarget.style.setProperty(
      "--card-y",
      `${(event.clientY - rect.top) / rect.height}`,
    );
  };
  return (
    <article className="feature-card feature-card-next" data-reveal onPointerMove={tilt}>
      <div><span>{icon}</span><small>{number}</small></div>
      <h3>{title}</h3>
      <p>{text}</p>
      <ChevronRight className="feature-arrow" size={18} />
    </article>
  );
}
