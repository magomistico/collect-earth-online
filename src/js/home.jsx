import React, { useEffect, useRef } from "react";
import ReactDOM from "react-dom";
import { INAB_LOGO_SHAPE } from "./home/inabShapeData";

function Home({ userId, userName }) {
  const canvasRef = useRef(null);
  const anchorRef = useRef(null);
  const controlsRef = useRef({
    disperse: () => {},
    assemble: () => {},
  });

  const loggedOut = !userName || userName === "guest" || !userId || userId === -1;

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

    let morphProgress = 0; // 0 = full screen stars, 1 = assembled center logo
    let morphTarget = 0;

    let seed = 49217;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const filteredShape = INAB_LOGO_SHAPE.filter((_, i) => !coarse || i % 2 === 0);

    const particles = filteredShape.map(([x, y, bright], i) => {
      const starX = random() * width;
      const starY = random() * height;
      const starVx = (random() - 0.5) * 0.35;
      const starVy = (random() - 0.5) * 0.35;

      return {
        ox: x,
        oy: y,
        starX,
        starY,
        starVx,
        starVy,
        x: starX,
        y: starY,
        vx: starVx,
        vy: starVy,
        phase: random() * Math.PI * 2,
        radius: 0.45 + random() * 0.55,
        color: i % 43 === 0 ? 4 : bright ? 3 : i % 3,
        glow: i % 71 === 0,
      };
    });

    let pointer = { x: -9999, y: -9999, active: false };

    const onPointerMove = (e) => {
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      pointer.active = true;
    };
    const onPointerLeave = () => {
      pointer.active = false;
    };
    const onPointerDown = (e) => {
      const px = e.clientX;
      const py = e.clientY;
      for (const p of particles) {
        const dx = p.x - px;
        const dy = p.y - py;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        if (dist < 180) {
          const force = (1 - dist / 180) * 14;
          p.vx += (dx / dist) * force;
          p.vy += (dy / dist) * force;
        }
      }
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerleave", onPointerLeave);
    window.addEventListener("pointerdown", onPointerDown);

    function updateAnchorCenter() {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 2);

      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const rect = logoAnchor.getBoundingClientRect();
      centerX = rect.left + rect.width / 2;
      centerY = rect.top + rect.height / 2;

      const anchorW = Math.max(160, rect.width * 0.92);
      const anchorH = Math.max(160, rect.height * 0.92);
      scale = Math.min(anchorW / 466, anchorH / 355, 1.28);
    }

    const setAssemble = () => {
      morphTarget = 1;
    };

    const setDisperse = () => {
      morphTarget = 0;
      for (const p of particles) {
        p.starX = random() * width;
        p.starY = random() * height;
        p.starVx = (random() - 0.5) * 0.4;
        p.starVy = (random() - 0.5) * 0.4;
      }
    };

    controlsRef.current.assemble = setAssemble;
    controlsRef.current.disperse = setDisperse;

    const timerId = setTimeout(setAssemble, 1000);

    function update(delta) {
      time += delta * 0.016;

      if (morphProgress < morphTarget) {
        morphProgress = Math.min(morphTarget, morphProgress + 0.03 * delta);
      } else if (morphProgress > morphTarget) {
        morphProgress = Math.max(morphTarget, morphProgress - 0.03 * delta);
      }

      const t = morphProgress * morphProgress * (3 - 2 * morphProgress);
      const pointerRadius = 80;
      const pointerRadiusSq = pointerRadius * pointerRadius;
      const damping = Math.pow(0.89, delta);

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];

        p.starX += p.starVx * delta;
        p.starY += p.starVy * delta;
        if (p.starX < 0) p.starX = width;
        if (p.starX > width) p.starX = 0;
        if (p.starY < 0) p.starY = height;
        if (p.starY > height) p.starY = 0;

        const logoX =
          centerX + p.ox * scale + Math.sin(time * 0.7 + p.phase) * 0.5 * scale;
        const logoY =
          centerY + p.oy * scale + Math.cos(time * 0.6 + p.phase) * 0.5 * scale;

        const targetX = p.starX * (1 - t) + logoX * t;
        const targetY = p.starY * (1 - t) + logoY * t;

        const k = 0.032 * (0.5 + 0.5 * t);
        p.vx += (targetX - p.x) * k * delta;
        p.vy += (targetY - p.y) * k * delta;

        if (pointer.active) {
          const dx = p.x - pointer.x;
          const dy = p.y - pointer.y;
          const dsq = dx * dx + dy * dy;
          if (dsq < pointerRadiusSq && dsq > 0.1) {
            const dist = Math.sqrt(dsq);
            const force = (1 - dist / pointerRadius) * 3.4 * delta;
            p.vx += (dx / dist) * force;
            p.vy += (dy / dist) * force;
          }
        }

        p.vx *= damping;
        p.vy *= damping;
        p.x += p.vx * delta;
        p.y += p.vy * delta;
      }
    }

    function render() {
      ctx.clearRect(0, 0, width, height);

      ctx.globalAlpha = 0.94;
      for (let c = 0; c < palette.length; c++) {
        ctx.fillStyle = palette[c];
        ctx.beginPath();
        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          if (p.color !== c) continue;
          const r = Math.max(0.45, p.radius * Math.max(0.7, scale));
          ctx.moveTo(p.x + r, p.y);
          ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        }
        ctx.fill();
      }

      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (!p.glow) continue;
        const glowSize = 7.5 * Math.max(0.7, scale);
        const alpha = 0.2 + 0.25 * (0.5 + 0.5 * Math.sin(time * 2 + p.phase));
        ctx.globalAlpha = alpha;
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, glowSize);
        grad.addColorStop(0, "#f2fbf1");
        grad.addColorStop(0.3, "#86efac");
        grad.addColorStop(1, "rgba(74, 222, 128, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(p.x, p.y, glowSize, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.globalAlpha = 1;
    }

    let lastTime = 0;
    function loop(now) {
      if (!lastTime) lastTime = now;
      const delta = Math.min(2.5, Math.max(0.2, (now - lastTime) / 16.667));
      lastTime = now;
      update(delta);
      render();
      animFrameId = requestAnimationFrame(loop);
    }

    window.addEventListener("resize", updateAnchorCenter);
    updateAnchorCenter();
    animFrameId = requestAnimationFrame(loop);

    return () => {
      clearTimeout(timerId);
      if (animFrameId) cancelAnimationFrame(animFrameId);
      window.removeEventListener("resize", updateAnchorCenter);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, []);

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100vw",
        backgroundColor: "#060706",
        color: "#ededed",
        fontFamily:
          "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        overflowX: "hidden",
        position: "relative",
        WebkitFontSmoothing: "antialiased",
      }}
    >
      {/* Fullscreen Particle Canvas */}
      <canvas
        ref={canvasRef}
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          zIndex: 1,
          pointerEvents: "auto",
          display: "block",
        }}
      />

      {/* Top Minimalist Header with Integrated Navigation (INICIO & INAB) */}
      <header
        style={{
          position: "relative",
          zIndex: 10,
          width: "100%",
          maxWidth: "1280px",
          margin: "0 auto",
          padding: "28px 32px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          pointerEvents: "none",
        }}
      >
        {/* Brand Left */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            pointerEvents: "auto",
            cursor: "pointer",
          }}
          onClick={() => (window.location.href = "/home")}
        >
          <span
            style={{
              fontWeight: 700,
              letterSpacing: "0.08em",
              color: "#ffffff",
              fontSize: "15px",
            }}
          >
            INAB
          </span>
          <span style={{ color: "#52525b" }}>/</span>
          <span
            style={{
              color: "#a1a1aa",
              letterSpacing: "0.06em",
              fontWeight: 500,
              fontSize: "14px",
            }}
          >
            SIG
          </span>
        </div>

        {/* Center Navigation Pills: INICIO and INAB */}
        <nav
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "4px",
            borderRadius: "9999px",
            backgroundColor: "rgba(24, 24, 27, 0.7)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            backdropFilter: "blur(10px)",
            pointerEvents: "auto",
          }}
        >
          <button
            type="button"
            onClick={() => (window.location.href = "/home")}
            style={{
              padding: "6px 18px",
              borderRadius: "9999px",
              fontSize: "12px",
              fontWeight: 600,
              letterSpacing: "0.06em",
              border: "none",
              backgroundColor: "#ffffff",
              color: "#060706",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
          >
            INICIO
          </button>

          <button
            type="button"
            onClick={() =>
              (window.location.href = "/review-institution?institutionId=1")
            }
            style={{
              padding: "6px 18px",
              borderRadius: "9999px",
              fontSize: "12px",
              fontWeight: 600,
              letterSpacing: "0.06em",
              border: "none",
              backgroundColor: "transparent",
              color: "#d4d4d8",
              cursor: "pointer",
              transition: "all 0.2s ease",
            }}
            onMouseOver={(e) => {
              e.currentTarget.style.color = "#ffffff";
              e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.08)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.color = "#d4d4d8";
              e.currentTarget.style.backgroundColor = "transparent";
            }}
          >
            INAB
          </button>

          {!loggedOut && (
            <button
              type="button"
              onClick={() =>
                (window.location.href = `/account?accountId=${userId}`)
              }
              style={{
                padding: "6px 16px",
                borderRadius: "9999px",
                fontSize: "12px",
                fontWeight: 500,
                letterSpacing: "0.04em",
                border: "none",
                backgroundColor: "transparent",
                color: "#a1a1aa",
                cursor: "pointer",
              }}
            >
              CUENTA
            </button>
          )}
        </nav>

        {/* Right Auth Controls */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            pointerEvents: "auto",
          }}
        >
          {loggedOut ? (
            <button
              type="button"
              onClick={() =>
                (window.location.href =
                  "/login?returnurl=" +
                  encodeURIComponent("/review-institution?institutionId=1"))
              }
              style={{
                padding: "8px 18px",
                borderRadius: "9999px",
                fontSize: "12px",
                fontWeight: 500,
                backgroundColor: "#ffffff",
                color: "#060706",
                border: "none",
                cursor: "pointer",
                transition: "all 0.2s ease",
              }}
            >
              Iniciar Sesión
            </button>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "12px", color: "#a1a1aa" }}>
                {userName}
              </span>
              <button
                type="button"
                onClick={handleLogout}
                style={{
                  padding: "7px 15px",
                  borderRadius: "9999px",
                  fontSize: "12px",
                  fontWeight: 500,
                  backgroundColor: "rgba(255, 255, 255, 0.06)",
                  color: "#e4e4e7",
                  border: "1px solid rgba(255, 255, 255, 0.14)",
                  cursor: "pointer",
                }}
              >
                Cerrar Sesión
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Hero Section: INAB (left) | Center Particle Logo | SIG (right) */}
      <main
        style={{
          position: "relative",
          zIndex: 10,
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px 24px",
          maxWidth: "1280px",
          width: "100%",
          margin: "0 auto",
          pointerEvents: "none",
        }}
      >
        {/* Flanked Row */}
        <div
          style={{
            width: "100%",
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "center",
            gap: "16px",
          }}
        >
          {/* Left: ONLY INAB */}
          <div
            style={{
              flex: "1 1 200px",
              display: "flex",
              justifyContent: "flex-end",
              userSelect: "none",
            }}
          >
            <h1
              style={{
                fontSize: "clamp(3.8rem, 8vw, 7.5rem)",
                fontWeight: 700,
                letterSpacing: "-0.05em",
                color: "#ffffff",
                lineHeight: 1,
                margin: 0,
              }}
            >
              INAB
            </h1>
          </div>

          {/* Center Optical Anchor for Assembled Logo */}
          <div
            ref={anchorRef}
            style={{
              flex: "0 1 460px",
              width: "100%",
              maxWidth: "460px",
              height: "340px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          />

          {/* Right: ONLY SIG */}
          <div
            style={{
              flex: "1 1 200px",
              display: "flex",
              justifyContent: "flex-start",
              userSelect: "none",
            }}
          >
            <h1
              style={{
                fontSize: "clamp(3.8rem, 8vw, 7.5rem)",
                fontWeight: 700,
                letterSpacing: "-0.05em",
                color: "#ffffff",
                lineHeight: 1,
                margin: 0,
              }}
            >
              SIG
            </h1>
          </div>
        </div>

        {/* Subtitle & Controls */}
        <div
          style={{
            marginTop: "28px",
            textAlign: "center",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "20px",
            pointerEvents: "auto",
          }}
        >
          <p
            style={{
              fontSize: "15px",
              color: "#a1a1aa",
              margin: 0,
              letterSpacing: "-0.01em",
            }}
          >
            Sistema de Información Geográfica y Validación Forestal
          </p>

          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "center",
              gap: "12px",
            }}
          >
            <button
              type="button"
              onClick={() =>
                (window.location.href = "/review-institution?institutionId=1")
              }
              style={{
                padding: "12px 28px",
                borderRadius: "9999px",
                fontSize: "13px",
                fontWeight: 600,
                backgroundColor: "#ffffff",
                color: "#060706",
                border: "none",
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "8px",
                transition: "transform 0.15s ease, background-color 0.15s ease",
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.backgroundColor = "#e4e4e7";
                e.currentTarget.style.transform = "translateY(-1px)";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.backgroundColor = "#ffffff";
                e.currentTarget.style.transform = "translateY(0)";
              }}
            >
              <span>Entrar a INAB · SIG</span>
              <span style={{ fontSize: "15px", lineHeight: 1 }}>→</span>
            </button>

            <button
              type="button"
              onClick={() => controlsRef.current.disperse()}
              style={{
                padding: "12px 20px",
                borderRadius: "9999px",
                fontSize: "12px",
                fontWeight: 400,
                backgroundColor: "rgba(0, 0, 0, 0.45)",
                color: "#a1a1aa",
                border: "1px solid rgba(255, 255, 255, 0.14)",
                backdropFilter: "blur(8px)",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.color = "#ffffff";
                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.35)";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.color = "#a1a1aa";
                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.14)";
              }}
            >
              Dispersar en estrellas
            </button>

            <button
              type="button"
              onClick={() => controlsRef.current.assemble()}
              style={{
                padding: "12px 20px",
                borderRadius: "9999px",
                fontSize: "12px",
                fontWeight: 400,
                backgroundColor: "rgba(0, 0, 0, 0.45)",
                color: "#a1a1aa",
                border: "1px solid rgba(255, 255, 255, 0.14)",
                backdropFilter: "blur(8px)",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              onMouseOver={(e) => {
                e.currentTarget.style.color = "#ffffff";
                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.35)";
              }}
              onMouseOut={(e) => {
                e.currentTarget.style.color = "#a1a1aa";
                e.currentTarget.style.borderColor = "rgba(255, 255, 255, 0.14)";
              }}
            >
              Ensamblar logo
            </button>
          </div>
        </div>
      </main>

      {/* Minimal Editorial Footer */}
      <footer
        style={{
          position: "relative",
          zIndex: 10,
          width: "100%",
          maxWidth: "1280px",
          margin: "0 auto",
          padding: "24px 32px",
          borderTop: "1px solid rgba(255, 255, 255, 0.06)",
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
          fontSize: "12px",
          color: "#71717a",
          pointerEvents: "auto",
        }}
      >
        <div>
          <span>Instituto Nacional de Bosques (INAB) · Guatemala</span>
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            gap: "10px",
            fontSize: "11px",
          }}
        >
          <span>Basado en el código abierto de</span>
          <a
            href="https://collect.earth"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#a1a1aa", textDecoration: "underline" }}
          >
            Collect Earth Online
          </a>
          <span style={{ color: "#3f3f46" }}>y</span>
          <a
            href="https://github.com/openforis/collect-earth-online"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: "#a1a1aa", textDecoration: "underline" }}
          >
            Open Foris
          </a>
          <span style={{ color: "#3f3f46" }}>·</span>
          <span style={{ color: "#d4d4d8", fontWeight: 500 }}>
            Updated by Marlon R. Vásquez
          </span>
        </div>
      </footer>
    </div>
  );
}

export function pageInit(params, session) {
  ReactDOM.render(
    <Home
      userId={session.userId}
      userName={session.userName}
      version={session.versionDeployed}
    />,
    document.getElementById("app")
  );
}
