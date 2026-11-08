import React, { useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { INAB_LOGO_SHAPE } from "./home/inabShapeData";

function Home({ userId, userName }) {
  const canvasRef = useRef(null);
  const anchorRef = useRef(null);

  const loggedOut = !userName || userName === "guest" || !userId || userId === -1;

  const handleEnterPortal = () => {
    if (loggedOut) {
      window.location.assign("/login?returnurl=" + encodeURIComponent("/review-institution?institutionId=1"));
    } else {
      window.location.assign("/review-institution?institutionId=1");
    }
  };

  const handleLogout = () => {
    fetch("/logout", { method: "POST" }).then(() => window.location.assign("/home"));
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const logoAnchor = anchorRef.current;
    if (!canvas || !logoAnchor) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let width = window.innerWidth;
    let height = window.innerHeight;
    let dpr = Math.min(window.devicePixelRatio || 1, 2);
    let scale = 1;
    let centerX = width / 2;
    let centerY = height / 2;
    let time = 0;
    let animFrameId = null;

    const palette = ["#72b879", "#9ed999", "#4d9860", "#bfe8bc", "#edf9eb"];

    let morphProgress = 0;
    let morphTarget = 0;

    let seed = 49217;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    // Estrellas cósmicas de fondo que titilan suavemente en toda la pantalla
    const bgStars = Array.from({ length: 190 }, () => ({
      x: random() * width,
      y: random() * height,
      vx: (random() - 0.5) * 0.18,
      vy: (random() - 0.5) * 0.18,
      r: 0.4 + random() * 0.9,
      phase: random() * Math.PI * 2,
    }));

    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const filteredShape = INAB_LOGO_SHAPE.filter((_, i) => !coarse || i % 2 === 0);

    const particles = filteredShape.map(([x, y, bright], i) => {
      const angle = random() * Math.PI * 2;
      const dist = 120 + random() * Math.max(width, height) * 0.75;
      const starX = width / 2 + Math.cos(angle) * dist;
      const starY = height / 2 + Math.sin(angle) * dist;

      return {
        ox: x,
        oy: y,
        starX,
        starY,
        x: starX,
        y: starY,
        vx: 0,
        vy: 0,
        phase: random() * Math.PI * 2,
        radius: 0.48 + random() * 0.62,
        color: i % 37 === 0 ? 4 : bright ? 3 : i % 3,
        isSpore: i % 29 === 0,
        sporeOffset: random() * 100,
      };
    });

    let pointer = {
      x: -9999,
      y: -9999,
      vx: 0,
      vy: 0,
      lastX: -9999,
      lastY: -9999,
      active: false,
    };

    const onPointerMove = (e) => {
      pointer.vx = e.clientX - (pointer.lastX === -9999 ? e.clientX : pointer.lastX);
      pointer.vy = e.clientY - (pointer.lastY === -9999 ? e.clientY : pointer.lastY);
      pointer.lastX = pointer.x = e.clientX;
      pointer.lastY = pointer.y = e.clientY;
      pointer.active = true;
    };
    const onPointerLeave = () => {
      pointer.active = false;
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerleave", onPointerLeave);

    const updateAnchorMetrics = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const rect = logoAnchor.getBoundingClientRect();
      centerX = rect.left + rect.width / 2;
      centerY = rect.top + rect.height / 2;
      scale = Math.min(rect.width / 460, rect.height / 360) * 0.96;
    };

    window.addEventListener("resize", updateAnchorMetrics);
    updateAnchorMetrics();

    const timerId = setTimeout(() => {
      morphTarget = 1;
    }, 350);

    const render = () => {
      time += 0.018;
      ctx.clearRect(0, 0, width, height);

      const rect = logoAnchor.getBoundingClientRect();
      centerX += (rect.left + rect.width / 2 - centerX) * 0.14;
      centerY += (rect.top + rect.height / 2 - centerY) * 0.14;
      const targetScale = Math.min(rect.width / 460, rect.height / 360) * 0.96;
      scale += (targetScale - scale) * 0.14;

      // 1. Estrellas de fondo en toda la pantalla
      ctx.fillStyle = "#bfe8bc";
      for (let i = 0; i < bgStars.length; i++) {
        const s = bgStars[i];
        s.x += s.vx;
        s.y += s.vy;
        if (s.x < 0) s.x = width;
        if (s.x > width) s.x = 0;
        if (s.y < 0) s.y = height;
        if (s.y > height) s.y = 0;
        ctx.globalAlpha = 0.12 + 0.25 * Math.sin(time * 1.4 + s.phase);
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }

      morphProgress += (morphTarget - morphProgress) * 0.032;

      // Halo esmeralda detrás del logo ensamblado
      if (morphProgress > 0.1) {
        const glowRadius = 210 * scale;
        const grad = ctx.createRadialGradient(centerX, centerY, 8, centerX, centerY, glowRadius);
        const pulse = 0.07 + Math.sin(time * 1.5) * 0.025;
        grad.addColorStop(0, `rgba(77, 152, 96, ${pulse * morphProgress})`);
        grad.addColorStop(0.55, `rgba(22, 83, 55, ${pulse * 0.45 * morphProgress})`);
        grad.addColorStop(1, "rgba(6, 7, 6, 0)");
        ctx.globalAlpha = 1;
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(centerX, centerY, glowRadius, 0, Math.PI * 2);
        ctx.fill();
      }

      // Onda de luz diagonal recorriendo las hojas del logo
      const waveSweep = ((time * 110) % 700) - 350;

      for (let c = 0; c < palette.length; c++) {
        ctx.fillStyle = palette[c];
        ctx.beginPath();

        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          if (p.color !== c) continue;

          // Movimiento orgánico de brisa en las copas y respiración suave
          const windX =
            Math.sin(time * 1.7 + p.oy * 0.028 + p.phase) * 2.1 +
            Math.cos(time * 0.9 + p.ox * 0.02) * 1.1;
          const windY =
            Math.cos(time * 1.4 + p.ox * 0.028 + p.phase) * 2.1 +
            Math.sin(time * 2.1 + p.oy * 0.03) * 0.9;

          // Esporas / luciérnagas del bosque que ascienden suavemente
          let sporeLiftY = 0;
          let sporeSwayX = 0;
          if (p.isSpore && morphProgress > 0.7) {
            const cycle = (time * 0.45 + p.sporeOffset) % 1;
            if (cycle > 0.65) {
              const liftProgress = (cycle - 0.65) / 0.35;
              sporeLiftY = -liftProgress * 28 * scale;
              sporeSwayX = Math.sin(liftProgress * Math.PI * 3 + p.phase) * 8 * scale;
            }
          }

          const breath = 1 + Math.sin(time * 1.3) * 0.018;
          const logoX = centerX + (p.ox * breath + windX) * scale + sporeSwayX;
          const logoY = centerY + (p.oy * breath + windY) * scale + sporeLiftY;

          // Giro orbital durante la convergencia
          const unmorphed = 1 - morphProgress;
          const swirlAngle = unmorphed * 1.6;
          const dxStar = p.starX - centerX;
          const dyStar = p.starY - centerY;
          const swirledStarX =
            centerX + dxStar * Math.cos(swirlAngle) - dyStar * Math.sin(swirlAngle);
          const swirledStarY =
            centerY + dxStar * Math.sin(swirlAngle) + dyStar * Math.cos(swirlAngle);

          const targetX = swirledStarX * unmorphed + logoX * morphProgress;
          const targetY = swirledStarY * unmorphed + logoY * morphProgress;

          const spring = 0.045 + morphProgress * 0.055;
          p.vx += (targetX - p.x) * spring;
          p.vy += (targetY - p.y) * spring;

          // Interacción fluida con el cursor
          if (pointer.active) {
            const dx = p.x - pointer.x;
            const dy = p.y - pointer.y;
            const distSq = dx * dx + dy * dy;
            const radius = 115;
            if (distSq < radius * radius) {
              const dist = Math.sqrt(distSq) || 1;
              const force = Math.pow(1 - dist / radius, 2) * 2.8;
              p.vx +=
                (dx / dist) * force +
                (-dy / dist) * force * 0.35 +
                pointer.vx * 0.04;
              p.vy +=
                (dy / dist) * force +
                (dx / dist) * force * 0.35 +
                pointer.vy * 0.04;
            }
          }

          p.vx *= 0.84;
          p.vy *= 0.84;
          p.x += p.vx;
          p.y += p.vy;

          const diagDist = Math.abs(p.ox + p.oy - waveSweep);
          const waveBoost = diagDist < 45 ? (1 - diagDist / 45) * 0.55 : 0;
          const r = p.radius * (0.85 + 0.32 * scale + waveBoost);

          ctx.moveTo(p.x + r, p.y);
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        }

        ctx.globalAlpha = 0.72 + 0.22 * morphProgress;
        ctx.fill();
      }

      animFrameId = requestAnimationFrame(render);
    };

    animFrameId = requestAnimationFrame(render);

    return () => {
      clearTimeout(timerId);
      if (animFrameId) cancelAnimationFrame(animFrameId);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("resize", updateAnchorMetrics);
    };
  }, []);

  return (
    <div className="inab-astra-root">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

        html, body, #app {
          margin: 0 !important;
          padding: 0 !important;
          padding-top: 0 !important;
          width: 100%;
          min-height: 100vh;
          background-color: #060706 !important;
          color: #ededed;
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          -webkit-font-smoothing: antialiased;
          overflow-x: hidden;
        }

        .inab-astra-root {
          position: relative;
          min-height: 100vh;
          width: 100vw;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          background-color: #060706;
          color: #ededed;
          overflow: hidden;
        }

        .inab-particle-canvas {
          position: fixed;
          top: 0;
          left: 0;
          width: 100vw;
          height: 100vh;
          z-index: 1;
          pointer-events: auto;
          display: block;
        }

        .inab-ui-layer {
          position: relative;
          z-index: 10;
          pointer-events: none;
        }

        .inab-interactive {
          pointer-events: auto;
        }

        .inab-header {
          width: 100%;
          max-width: 1280px;
          margin: 0 auto;
          padding: 1.75rem 2.5rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 0.78rem;
        }

        .inab-brand-left {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          text-decoration: none;
        }

        .inab-brand-left:hover {
          text-decoration: none;
        }

        .inab-btn-primary {
          background-color: #ffffff;
          color: #060706 !important;
          font-weight: 600;
          border: none;
          border-radius: 9999px;
          padding: 0.72rem 1.75rem;
          font-size: 0.85rem;
          display: inline-flex;
          align-items: center;
          gap: 0.6rem;
          cursor: pointer;
          text-decoration: none !important;
          box-shadow: 0 0 30px rgba(158, 217, 153, 0.18);
          transition: all 0.22s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .inab-btn-primary:hover {
          background-color: #dcfce7;
          transform: translateY(-1px) scale(1.01);
          box-shadow: 0 0 38px rgba(158, 217, 153, 0.35);
          color: #060706 !important;
        }

        .inab-btn-ghost {
          color: #d4d4d8 !important;
          border: 1px solid rgba(255, 255, 255, 0.14);
          background-color: rgba(0, 0, 0, 0.45);
          backdrop-filter: blur(8px);
          border-radius: 9999px;
          padding: 0.52rem 1.15rem;
          font-size: 0.76rem;
          font-weight: 500;
          cursor: pointer;
          text-decoration: none !important;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }

        .inab-btn-ghost:hover {
          color: #ffffff !important;
          border-color: rgba(158, 217, 153, 0.45);
          background-color: rgba(114, 184, 121, 0.12);
        }

        .inab-hero-main {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 1rem 1.5rem;
          max-width: 1280px;
          margin: 0 auto;
          width: 100%;
        }

        .inab-hero-grid {
          width: 100%;
          display: grid;
          grid-template-columns: 1fr minmax(280px, 460px) 1fr;
          align-items: center;
          gap: 1rem;
        }

        .inab-word-left {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          user-select: none;
        }

        .inab-word-right {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          user-select: none;
        }

        .inab-big-title {
          font-size: clamp(3.5rem, 8vw, 7.5rem);
          font-weight: 800;
          letter-spacing: -0.05em;
          color: #ffffff;
          line-height: 1;
          margin: 0;
        }

        .inab-logo-anchor {
          width: 100%;
          max-width: 460px;
          height: 350px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .inab-footer {
          width: 100%;
          max-width: 1280px;
          margin: 0 auto;
          padding: 1.25rem 2.5rem;
          border-top: 1px solid rgba(255, 255, 255, 0.06);
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 1rem;
          font-size: 0.72rem;
          color: #71717a;
        }

        .inab-footer a {
          color: #a1a1aa;
          text-decoration: underline;
          transition: color 0.15s ease;
        }

        .inab-footer a:hover {
          color: #ffffff;
        }

        @media (max-width: 768px) {
          .inab-header {
            padding: 1.25rem 1.25rem;
          }
          .inab-hero-grid {
            grid-template-columns: 1fr;
            text-align: center;
          }
          .inab-word-left, .inab-word-right {
            justify-content: center;
          }
          .inab-logo-anchor {
            height: 260px;
            order: -1;
          }
          .inab-footer {
            padding: 1rem 1.25rem;
            justify-content: center;
            text-align: center;
          }
        }
      `}</style>

      {/* LIENZO DE PARTÍCULAS DE PANTALLA COMPLETA */}
      <canvas ref={canvasRef} className="inab-particle-canvas" />

      {/* BARRA SUPERIOR MINIMALISTA */}
      <header className="inab-ui-layer inab-header">
        <a href="/home" className="inab-interactive inab-brand-left">
          <span style={{ fontWeight: 700, letterSpacing: "0.08em", color: "#ffffff", fontSize: "0.9rem" }}>
            INAB
          </span>
          <span style={{ color: "rgba(114, 184, 121, 0.6)" }}>/</span>
          <span style={{ color: "#a1a1aa", letterSpacing: "0.08em", fontWeight: 500 }}>
            SIG
          </span>
        </a>

        <div className="inab-interactive" style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
          {loggedOut ? (
            <button type="button" onClick={handleEnterPortal} className="inab-btn-ghost">
              Iniciar Sesión
            </button>
          ) : (
            <>
              <span style={{ color: "#a1a1aa", fontSize: "0.75rem" }}>{userName}</span>
              <button type="button" onClick={handleLogout} className="inab-btn-ghost">
                Cerrar Sesión
              </button>
            </>
          )}
        </div>
      </header>

      {/* CENTRO HERO: INAB (izquierda) | Logo Dinámico (centro) | SIG (derecha) */}
      <main className="inab-ui-layer inab-hero-main">
        <div style={{ width: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", margin: "auto 0" }}>
          <div className="inab-hero-grid">
            <div className="inab-word-left">
              <h1 className="inab-big-title">INAB</h1>
            </div>

            <div>
              <div ref={anchorRef} className="inab-logo-anchor" />
            </div>

            <div className="inab-word-right">
              <h1 className="inab-big-title">SIG</h1>
            </div>
          </div>

          {/* Botón único de acceso directo */}
          <div className="inab-interactive" style={{ marginTop: "1.5rem", display: "flex", flexDirection: "column", alignItems: "center", gap: "1.15rem" }}>
            <p style={{ fontSize: "0.84rem", color: "#a1a1aa", fontWeight: 400, letterSpacing: "0.03em", margin: 0, textAlign: "center" }}>
              Sistema de Información Geográfica y Validación Forestal
            </p>

            <button type="button" onClick={handleEnterPortal} className="inab-btn-primary">
              <span>Entrar a INAB · SIG</span>
              <svg width="15" height="15" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>
        </div>
      </main>

      {/* PIE DE PÁGINA CON ATRIBUCIÓN OPEN SOURCE Y AUTOR */}
      <footer className="inab-ui-layer inab-footer">
        <div>
          <span>Instituto Nacional de Bosques (INAB) · Guatemala</span>
        </div>

        <div className="inab-interactive" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: "0.45rem" }}>
          <span>Basado en el código abierto de</span>
          <a href="https://collect.earth" target="_blank" rel="noopener noreferrer">
            Collect Earth Online
          </a>
          <span>y</span>
          <a href="https://github.com/openforis/collect-earth-online" target="_blank" rel="noopener noreferrer">
            Open Foris
          </a>
          <span style={{ color: "#3f3f46" }}>·</span>
          <span style={{ color: "#e4e4e7", fontWeight: 500 }}>Updated by Marlon R. Vásquez</span>
        </div>
      </footer>
    </div>
  );
}

export function pageInit(params, session) {
  ReactDOM.render(
    <Home
      userId={session.userId || -1}
      userName={session.userName || "guest"}
    />,
    document.getElementById("app")
  );
}
