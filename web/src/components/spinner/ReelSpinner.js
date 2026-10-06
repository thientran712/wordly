"use client";

import { useEffect, useRef, useState, useCallback } from "react";

// Long Part 2 cue-card sentences need to fit inside .reel-item's fixed
// max-height (see globals.css) — every item must render at the same height
// for the spin offset math below to land on the right one, so long text is
// hard-truncated by character count here (plain, reliable) rather than via
// CSS line-clamp on a nested span, which caused the reel to render visually
// empty mid-spin on real devices (a -webkit-box child fighting the parent's
// flex centering + font-size transition).
function truncateText(text, max = 90) {
  if (!text || text.length <= max) return text;
  return text.slice(0, max - 1).trimEnd() + "…";
}

// Ported from the reference project's TopicSpinner.astro vanilla-DOM script.
// Direct DOM manipulation (via refs) is kept for the strip's transform/transition,
// matching the original — this is an animation-heavy "slot machine" effect that
// doesn't benefit from React re-renders on every frame. Styling follows Wordly's
// convention of inline style={{}} + CSS custom properties (see globals.css for
// the .reel-item/.handle-arm class rules this component relies on).
export default function ReelSpinner({ items, renderItem, onLanded, onSpinStart, disabled = false }) {
  const stripRef = useRef(null);
  const windowRef = useRef(null);
  const armRef = useRef(null);
  const itemsRef = useRef(items);
  const currentIndexRef = useRef(0);
  // Cached instead of re-queried from the DOM on every spin — .reel-item's
  // height is a fixed CSS value (see globals.css), so it only actually
  // changes at the sm: breakpoint, not per-spin. Querying it via
  // offsetHeight forces a synchronous layout flush right as we're about to
  // animate, which was contributing to the spin feeling janky.
  const itemHRef = useRef(160);
  const windowHRef = useRef(420);
  const [isSpinning, setIsSpinning] = useState(false);
  const [hasHinted, setHasHinted] = useState(false);

  useEffect(() => { itemsRef.current = items; }, [items]);

  const measure = useCallback(() => {
    const first = stripRef.current?.querySelector(".reel-item");
    if (first) itemHRef.current = first.offsetHeight;
    if (windowRef.current) windowHRef.current = windowRef.current.clientHeight;
  }, []);

  useEffect(() => {
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure]);

  const buildStrip = useCallback(() => {
    const strip = stripRef.current;
    const list = itemsRef.current;
    if (!strip || list.length === 0) return;
    strip.innerHTML = "";
    const centerIdx = currentIndexRef.current;
    for (let i = -2; i <= 2; i++) {
      const idx = ((centerIdx + i) % list.length + list.length) % list.length;
      const div = document.createElement("div");
      div.className = "reel-item";
      div.textContent = truncateText(renderItem(list[idx]));
      strip.appendChild(div);
    }
    measure();
    const h = itemHRef.current;
    const offset = -2 * h + (windowHRef.current / 2 - h / 2);
    strip.style.transition = "none";
    strip.style.transform = `translateY(${offset}px)`;
  }, [renderItem, measure]);

  useEffect(() => {
    if (items.length > 0) {
      buildStrip();
      const t = setTimeout(() => setHasHinted(true), 800);
      return () => clearTimeout(t);
    }
  }, [items, buildStrip]);

  const spin = useCallback(() => {
    if (isSpinning || disabled || itemsRef.current.length === 0) return;
    // Let the parent commit the previous landed item into the excluded set
    // *now* (start of this spin) rather than right after the previous spin
    // landed — that's what keeps the just-landed item visible/spinnable
    // until the user spins again, instead of vanishing immediately.
    // onSpinStart can return a fresher item list synchronously (parent
    // recomputes it inline, not via a state update we'd otherwise have to
    // wait a render for) so this spin uses the up-to-date exclusion.
    const freshList = onSpinStart?.();
    const list = (freshList && freshList.length > 0) ? freshList : itemsRef.current;
    const strip = stripRef.current;
    if (!strip) return;

    setIsSpinning(true);
    setHasHinted(false);

    const target = Math.floor(Math.random() * list.length);
    currentIndexRef.current = target;

    // Fewer items and a shorter spin than before — this was creating 17-24
    // brand-new DOM nodes per spin and animating a ~1.4-1.9s transition over
    // all of them (plus per-item transitions on the ones nearest the landed
    // slot), which is what made the spin feel janky on real devices. 8-12
    // full rotations is still visually a "slot machine" spin, just cheaper.
    const spins = 8 + Math.floor(Math.random() * 5);
    const pool = [];
    for (let i = 0; i < spins + 5; i++) pool.push(list[Math.floor(Math.random() * list.length)]);
    pool[Math.floor(spins / 2)] = list[target];

    // Build all nodes on a detached fragment and append once — avoids
    // triggering a reflow per appendChild call (the previous loop appended
    // directly to the live, already-laid-out strip element).
    strip.innerHTML = "";
    const fragment = document.createDocumentFragment();
    pool.forEach((item) => {
      const div = document.createElement("div");
      div.className = "reel-item";
      div.textContent = truncateText(renderItem(item));
      fragment.appendChild(div);
    });
    strip.appendChild(fragment);

    strip.style.transition = "none";
    strip.style.transform = "translateY(0px)";

    // Height is cached (see `measure`) rather than re-read from the DOM here
    // — reading offsetHeight this close to an animated transform forces a
    // synchronous layout flush right as the browser is about to start
    // compositing the spin, which was a second source of jank.
    const h = itemHRef.current;
    const windowH = windowHRef.current;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const landedIdx = Math.floor(spins / 2);
        const offset = -landedIdx * h + (windowH / 2 - h / 2);
        strip.style.transition = `transform ${0.08 * spins}s cubic-bezier(0.17,0.67,0.35,1)`;
        strip.style.transform = `translateY(${offset}px)`;
      });
    });

    const duration = 80 * spins;
    setTimeout(() => {
      const allItems = strip.querySelectorAll(".reel-item");
      const landedIdx = Math.floor(spins / 2);

      // Only toggle the size/blur classes here — do NOT recompute/shift the
      // strip's transform afterward. The strip is already centered on
      // landedIdx from the pre-spin offset calc (using the uniform pre-scale
      // item height), and every item is horizontally centered via flexbox,
      // so the landed item's midpoint stays under the center-line as it
      // grows via the font-size transition. Recomputing the offset here used
      // each item's *current* (mid-transition, already-shrinking) height,
      // which drifted from the height basis the initial transform used —
      // that mismatch was what made the wrong-looking item appear "landed".
      allItems.forEach((el, i) => {
        el.classList.remove("landed", "neighbor", "far");
        const dist = Math.abs(i - landedIdx);
        if (dist === 0) el.classList.add("landed");
        else if (dist === 1) el.classList.add("neighbor");
        else el.classList.add("far");
      });

      onLanded?.(list[target]);
      setIsSpinning(false);
    }, duration + 100);
  }, [isSpinning, disabled, renderItem, onLanded, onSpinStart]);

  // ── Lever drag (desktop) ──
  useEffect(() => {
    const arm = armRef.current;
    if (!arm) return;
    const knob = arm.querySelector(".handle-knob");
    if (!knob) return;

    let dragging = false, startY = 0, currentRot = 0;
    const MAX_ROT = 40;

    const onDown = (e) => {
      if (isSpinning || disabled) return;
      dragging = true;
      startY = e.touches ? e.touches[0].clientY : e.clientY;
      arm.classList.add("grabbing");
      arm.classList.remove("spring-back", "hint");
      e.preventDefault();
    };
    const onMove = (e) => {
      if (!dragging) return;
      const y = e.touches ? e.touches[0].clientY : e.clientY;
      const delta = y - startY;
      currentRot = Math.max(0, Math.min(MAX_ROT, delta * 0.6));
      arm.style.transform = `rotate(${currentRot}deg)`;
      e.preventDefault();
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      arm.classList.remove("grabbing");
      arm.classList.add("spring-back");
      arm.style.transform = "rotate(0deg)";
      if (currentRot > 15) spin();
      currentRot = 0;
    };

    knob.addEventListener("mousedown", onDown);
    knob.addEventListener("touchstart", onDown, { passive: false });
    document.addEventListener("mousemove", onMove);
    document.addEventListener("touchmove", onMove, { passive: false });
    document.addEventListener("mouseup", onUp);
    document.addEventListener("touchend", onUp);
    return () => {
      knob.removeEventListener("mousedown", onDown);
      knob.removeEventListener("touchstart", onDown);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.removeEventListener("touchend", onUp);
    };
  }, [spin, isSpinning, disabled]);

  const spinDisabled = isSpinning || disabled || items.length === 0;

  return (
    <div className="reel-col w-full flex-1 flex flex-col items-center">
      <div className="reel-assembly flex items-stretch w-full relative gap-3">
        <div
          ref={windowRef}
          className="reel-window flex-1 min-w-0 mt-4 relative overflow-hidden rounded-2xl h-[340px] sm:h-[420px]"
          style={{ background: "var(--surface)" }}
        >
          {/* Fade-out top/bottom, as two solid-to-transparent overlay layers
              instead of a mask-image on the window itself. mask-image caused
              the reel text to blank out both mid-spin and mid-scroll on real
              mobile devices (a known GPU-compositing bug where masked layers
              drop their paint under animation/scroll pressure) — plain
              overlay divs have no such interaction since they don't mask
              anything, just paint over it. */}
          <div
            className="absolute top-0 left-0 w-full pointer-events-none"
            style={{ height: 80, zIndex: 3, background: "linear-gradient(to bottom, var(--surface), transparent)" }}
          />
          <div
            className="absolute bottom-0 left-0 w-full pointer-events-none"
            style={{ height: 80, zIndex: 3, background: "linear-gradient(to top, var(--surface), transparent)" }}
          />

          <div
            className="absolute top-1/2 left-1/2 pointer-events-none"
            style={{
              transform: "translate(-50%,-50%)",
              width: "88%",
              height: 110,
              borderTop: "1px solid var(--line)",
              borderBottom: "1px solid var(--line)",
              zIndex: 2,
            }}
          />
          <div ref={stripRef} className="reel-strip absolute w-full left-0 top-0" style={{ willChange: "transform" }} />
        </div>

        {/* Pull lever — desktop only, sits inside the card as its own column instead of overflowing past the edge */}
        <div className="slot-handle hidden md:block relative flex-shrink-0 mt-4" style={{ width: 56, height: 420 }}>
          <div
            ref={armRef}
            className={`handle-arm ${hasHinted ? "hint" : ""} ${spinDisabled ? "disabled" : ""}`}
            style={{
              position: "absolute", bottom: 160, left: "50%", marginLeft: -3,
              width: 6, height: 68, transformOrigin: "center bottom", zIndex: 3,
            }}
          >
            <div className="handle-shaft" style={{ width: 6, height: "100%", borderRadius: 3, background: "var(--electric-muted)" }} />
            <div
              className="handle-knob"
              style={{
                position: "absolute", top: -18, left: "50%", transform: "translateX(-50%)",
                width: 40, height: 40, borderRadius: "50%",
                background: "radial-gradient(circle at 35% 35%, var(--duo-purple), var(--electric-muted))",
                border: "2px solid var(--electric-muted)", cursor: "grab", touchAction: "none",
                boxShadow: "0 2px 6px rgba(0,0,0,0.2)", display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <div
                className="handle-knob-grip"
                style={{
                  width: 16, height: 16, borderRadius: "50%",
                  background: "repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.3) 3px, rgba(255,255,255,0.3) 5px)",
                }}
              />
            </div>
          </div>
          <div
            className="handle-pivot"
            style={{
              position: "absolute", bottom: 150, left: "50%", transform: "translateX(-50%)",
              width: 20, height: 20, borderRadius: "50%",
              background: "radial-gradient(circle at 40% 40%, var(--electric-muted), var(--electric))",
              border: "2px solid var(--electric-muted)", zIndex: 4,
            }}
          />
        </div>
      </div>

      {/* Same flex-1 + lever-width layout as .reel-assembly above, so the button
          centers under the reel-window itself rather than under the whole
          assembly (which includes the lever column and would skew it right). */}
      <div className="flex w-full gap-3 mt-5">
        <div className="flex-1 min-w-0 flex justify-center">
          <button
            onClick={spin}
            disabled={spinDisabled}
            className="rounded-full font-bold transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              padding: "0.75rem 2.5rem",
              fontSize: "1rem",
              color: "var(--on-electric)",
              background: "linear-gradient(135deg, var(--electric), var(--electric-muted))",
              boxShadow: "0 4px 12px rgba(var(--electric-rgb),0.3)",
            }}
          >
            {isSpinning ? "Đang quay..." : "Quay!"}
          </button>
        </div>
        <div className="hidden md:block flex-shrink-0" style={{ width: 56 }} />
      </div>
    </div>
  );
}
