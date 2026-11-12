(() => {
  "use strict";

  document.getElementById("year").textContent = new Date().getFullYear();

  // Weak devices (little memory or few cores) get the lighter motion set: no glass
  // blur, blur-in reveals or scroll parallax — everything still works, just calmer.
  const liteMotion = (navigator.deviceMemory || 8) <= 3 || (navigator.hardwareConcurrency || 8) <= 3;
  document.documentElement.classList.toggle("lite-motion", liteMotion);

  // Inboxes notified when a quote is submitted, via FormSubmit.co (no backend
  // required). To add more, just add emails here — the form's action and
  // hidden _cc field below are kept in sync with this on load.
  const QUOTE_NOTIFY_EMAILS = ["albadourrami@gmail.com"];
  // Cal.com booking page (cal.com/<this>). Customers pick their install time here.
  const CAL_LINK = "rami-albadour-hcfr2i";

  /* ---------------------------------------------------------------------
     Sticky header + scroll progress bar
     --------------------------------------------------------------------- */
  const header = document.getElementById("siteHeader");
  const scrollProgress = document.getElementById("scrollProgress");
  const onScroll = () => {
    header.classList.toggle("is-scrolled", window.scrollY > 40);
    const scrollable = document.documentElement.scrollHeight - window.innerHeight;
    const pct = scrollable > 0 ? Math.min(100, (window.scrollY / scrollable) * 100) : 0;
    scrollProgress.style.width = `${pct}%`;
  };
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---------------------------------------------------------------------
     Mobile nav toggle
     --------------------------------------------------------------------- */
  const navToggle = document.getElementById("navToggle");
  const mainNav = document.getElementById("mainNav");
  navToggle.addEventListener("click", () => {
    const isOpen = mainNav.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", String(isOpen));
  });
  mainNav.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      mainNav.classList.remove("is-open");
      navToggle.setAttribute("aria-expanded", "false");
    });
  });

  /* ---------------------------------------------------------------------
     Scrollspy: highlight the nav link for the section currently in view
     --------------------------------------------------------------------- */
  const navLinks = Array.from(mainNav.querySelectorAll('a[href^="#"]'));
  const spySections = navLinks
    .map((link) => document.getElementById(link.getAttribute("href").slice(1)))
    .filter(Boolean);
  if ("IntersectionObserver" in window && spySections.length) {
    const setActiveLink = (id) => {
      navLinks.forEach((link) => link.classList.toggle("is-active", link.getAttribute("href") === `#${id}`));
    };
    const spyObserver = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible.length) setActiveLink(visible[0].target.id);
      },
      { rootMargin: "-45% 0px -45% 0px", threshold: [0, 0.25, 0.5, 0.75, 1] }
    );
    spySections.forEach((section) => spyObserver.observe(section));
  }

  /* ---------------------------------------------------------------------
     Hero parallax: glow blobs + car drift gently toward the cursor
     --------------------------------------------------------------------- */
  const heroSection = document.getElementById("top");
  if (heroSection && window.matchMedia("(pointer: fine)").matches && !prefersReducedMotionInit()) {
    let heroParallaxFrame = null;
    heroSection.addEventListener("mousemove", (event) => {
      if (heroParallaxFrame) return;
      heroParallaxFrame = requestAnimationFrame(() => {
        const rect = heroSection.getBoundingClientRect();
        const relX = (event.clientX - rect.left) / rect.width - 0.5;
        const relY = (event.clientY - rect.top) / rect.height - 0.5;
        heroSection.style.setProperty("--mx", String(relX * 28));
        heroSection.style.setProperty("--my", String(relY * 20));
        heroParallaxFrame = null;
      });
    });
    heroSection.addEventListener("mouseleave", () => {
      heroSection.style.setProperty("--mx", "0");
      heroSection.style.setProperty("--my", "0");
    });
  }
  function prefersReducedMotionInit() {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }

  /* ---------------------------------------------------------------------
     Shade slider (inside the Tint Studio). It owns the VLT value and broadcasts
     every change as a "dna:shade" event; js/tint-studio/main.js listens and
     tints the 3D car's glass. `committed` is true once it settles on a shade
     we actually offer.
     --------------------------------------------------------------------- */
  const shadeSlider = document.getElementById("shadeSlider");
  const shadeValue = document.getElementById("shadeValue");
  const shadeDesc = document.getElementById("shadeDesc");
  const shadePresets = document.querySelectorAll(".shade-preset");
  const shadeLevelSelect = document.getElementById("shadeLevel");

  const shadeDescriptionFor = (vlt) => {
    if (vlt >= 53) return "Light — near factory glass";
    if (vlt >= 27) return "Most popular daily-driver shade";
    if (vlt >= 12) return "Dark, high privacy";
    return "Limo black — maximum privacy";
  };

  const updateShadePreview = (vlt, committed = false, source = "slider") => {
    shadeValue.textContent = `${vlt}% VLT`;
    shadeDesc.textContent = shadeDescriptionFor(vlt);
    shadePresets.forEach((btn) => btn.classList.toggle("is-active", Number(btn.dataset.vlt) === vlt));
    window.dnaShade = vlt;
    document.dispatchEvent(new CustomEvent("dna:shade", { detail: { vlt, committed, source } }));
    if (committed && shadeLevelSelect) {
      // Keep the booking form's "Preferred Shade" in step with the studio.
      const match = Array.from(shadeLevelSelect.options).find((o) => o.text.startsWith(`${vlt}% VLT`));
      if (match) shadeLevelSelect.value = match.value;
    }
  };

  // The only VLT percentages we actually offer. The slider can be dragged
  // to any value in between for feel, but always glides to the nearest of
  // these on release, so it's clear those are the only real options.
  const ALLOWED_SHADES = [5, 20, 35, 70];
  const nearestAllowedShade = (vlt) =>
    ALLOWED_SHADES.reduce((closest, v) => (Math.abs(v - vlt) < Math.abs(closest - vlt) ? v : closest));

  let shadeGlideFrame = null;
  const glideShadeTo = (target, duration = 260, source = "slider") => {
    if (shadeGlideFrame) cancelAnimationFrame(shadeGlideFrame);
    const start = Number(shadeSlider.value);
    if (start === target) {
      updateShadePreview(target, true, source);
      return;
    }
    const startTime = performance.now();
    const easeOutCubic = (t) => 1 - (1 - t) ** 3;
    const step = (now) => {
      const t = Math.min(1, (now - startTime) / duration);
      const value = Math.round(start + (target - start) * easeOutCubic(t));
      shadeSlider.value = String(value);
      updateShadePreview(value, t >= 1, source);
      if (t < 1) {
        shadeGlideFrame = requestAnimationFrame(step);
      } else {
        shadeGlideFrame = null;
      }
    };
    shadeGlideFrame = requestAnimationFrame(step);
  };

  if (shadeSlider) {
    updateShadePreview(Number(shadeSlider.value), true);

    // Live, unsnapped feedback while actively dragging or touching.
    shadeSlider.addEventListener("input", () => updateShadePreview(Number(shadeSlider.value)));

    // On release (mouse, touch, or pointer), glide to the nearest shade we offer.
    const commitNearestShade = () => glideShadeTo(nearestAllowedShade(Number(shadeSlider.value)));
    shadeSlider.addEventListener("pointerup", commitNearestShade);
    shadeSlider.addEventListener("pointercancel", commitNearestShade);
    shadeSlider.addEventListener("touchend", commitNearestShade);
    shadeSlider.addEventListener("mouseup", commitNearestShade);

    // Keyboard: step directly between the shades we offer instead of by 1.
    shadeSlider.addEventListener("keydown", (event) => {
      const currentIndex = ALLOWED_SHADES.indexOf(nearestAllowedShade(Number(shadeSlider.value)));
      let nextIndex;
      if (event.key === "ArrowRight" || event.key === "ArrowUp") nextIndex = currentIndex + 1;
      else if (event.key === "ArrowLeft" || event.key === "ArrowDown") nextIndex = currentIndex - 1;
      else if (event.key === "Home") nextIndex = 0;
      else if (event.key === "End") nextIndex = ALLOWED_SHADES.length - 1;
      else return;
      event.preventDefault();
      nextIndex = Math.min(ALLOWED_SHADES.length - 1, Math.max(0, nextIndex));
      glideShadeTo(ALLOWED_SHADES[nextIndex]);
    });

    shadePresets.forEach((btn) => {
      btn.addEventListener("click", () => glideShadeTo(Number(btn.dataset.vlt)));
    });

    // The studio moves the slider when a shade is applied to every window from the car.
    window.dnaSetShade = (vlt) => glideShadeTo(vlt, 260, "studio");
  }

  /* ---------------------------------------------------------------------
     Scroll-reveal: progressive enhancement, only runs with IntersectionObserver
     and outside prefers-reduced-motion
     --------------------------------------------------------------------- */
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!prefersReducedMotion && "IntersectionObserver" in window) {
    document.documentElement.classList.add("js-reveal");
    const revealTargets = document.querySelectorAll("[data-reveal]");
    const revealObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15, rootMargin: "0px 0px -40px 0px" });
    revealTargets.forEach((el) => revealObserver.observe(el));
  }

  /* ---------------------------------------------------------------------
     Scroll parallax: decorative layers drift at their own speed
     (data-parallax="0.15" = 15% of the scroll offset; transform-only, rAF-throttled)
     --------------------------------------------------------------------- */
  const parallaxLayers = Array.from(document.querySelectorAll("[data-parallax]"));
  if (!prefersReducedMotion && !liteMotion && parallaxLayers.length) {
    let parallaxQueued = false;
    const updateParallax = () => {
      parallaxQueued = false;
      const vh = window.innerHeight;
      parallaxLayers.forEach((el) => {
        const r = (el.parentElement || el).getBoundingClientRect();
        if (r.bottom < -200 || r.top > vh + 200) return; // off screen: leave it
        const offset = r.top + r.height / 2 - vh / 2;
        el.style.setProperty("--py", (-offset * Number(el.dataset.parallax)).toFixed(1));
      });
    };
    window.addEventListener("scroll", () => {
      if (!parallaxQueued) { parallaxQueued = true; requestAnimationFrame(updateParallax); }
    }, { passive: true });
    updateParallax();
  }

  /* ---------------------------------------------------------------------
     Animated stat counters
     --------------------------------------------------------------------- */
  const statsGrid = document.getElementById("statsGrid");
  if (statsGrid && "IntersectionObserver" in window) {
    const animateCount = (el) => {
      const target = Number(el.dataset.count);
      const suffix = el.dataset.suffix || "";
      if (prefersReducedMotion) {
        el.textContent = `${target}${suffix}`;
        return;
      }
      const duration = 1200;
      const start = performance.now();
      const step = (now) => {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = `${Math.round(target * eased)}${suffix}`;
        if (progress < 1) window.requestAnimationFrame(step);
      };
      window.requestAnimationFrame(step);
    };
    const statsObserver = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.querySelectorAll("[data-count]").forEach(animateCount);
          statsObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.4 });
    statsObserver.observe(statsGrid);
  }

  /* ---------------------------------------------------------------------
     Back to top button
     --------------------------------------------------------------------- */
  const backToTop = document.getElementById("backToTop");
  window.addEventListener("scroll", () => {
    backToTop.hidden = window.scrollY < 600;
  }, { passive: true });
  backToTop.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));

  /* ---------------------------------------------------------------------
     Vehicle Year select + visual Make tile picker + Model cascade
     --------------------------------------------------------------------- */
  const yearSelect = document.getElementById("vehicleYear");
  const modelSelect = document.getElementById("vehicleModel");
  const makeTiles = document.getElementById("makeTiles");
  const makeSearch = document.getElementById("makeSearch");
  const makeTilesEmpty = document.getElementById("makeTilesEmpty");

  VEHICLE_YEARS.forEach((year) => {
    const opt = document.createElement("option");
    opt.value = String(year);
    opt.textContent = String(year);
    yearSelect.appendChild(opt);
  });

  const makeInitials = (name) => {
    const words = name.split(/[\s-]+/).filter(Boolean);
    if (words.length > 1) return words.slice(0, 3).map((w) => w[0].toUpperCase()).join("");
    if (name === name.toUpperCase() && name.length <= 4) return name;
    return name.slice(0, 2).toUpperCase();
  };

  VEHICLE_MAKES.forEach((make, index) => {
    const label = document.createElement("label");
    label.className = "tile";

    const input = document.createElement("input");
    input.type = "radio";
    input.name = "vehicleMake";
    input.value = make;
    if (index === 0) input.required = true;

    const span = document.createElement("span");
    const icon = document.createElement("span");
    icon.setAttribute("aria-hidden", "true");

    const slug = MAKE_LOGO_SLUGS[make];
    if (slug) {
      icon.className = "tile-icon";
      const img = document.createElement("img");
      img.src = `assets/logos/${slug}.png`;
      img.alt = "";
      img.loading = "lazy";
      icon.appendChild(img);
    } else {
      icon.className = "tile-icon tile-icon--text";
      icon.style.color = "#64748B";
      icon.style.background = "color-mix(in srgb, #64748B 14%, white)";
      icon.textContent = makeInitials(make);
    }

    span.appendChild(icon);
    span.appendChild(document.createTextNode(make));

    label.appendChild(input);
    label.appendChild(span);
    makeTiles.appendChild(label);
  });

  const updateModelsForMake = (make) => {
    const models = VEHICLE_MODELS_BY_MAKE[make];
    modelSelect.innerHTML = "";

    if (!models) {
      modelSelect.appendChild(new Option("Select make first", ""));
      modelSelect.disabled = true;
      return;
    }

    modelSelect.disabled = false;
    modelSelect.appendChild(new Option("Select model", ""));
    models.forEach((model) => modelSelect.appendChild(new Option(model, model)));
  };

  makeTiles.addEventListener("change", (event) => {
    if (event.target.name === "vehicleMake") updateModelsForMake(event.target.value);
  });

  makeSearch.addEventListener("input", () => {
    const query = makeSearch.value.trim().toLowerCase();
    let visibleCount = 0;
    makeTiles.querySelectorAll(".tile").forEach((tile) => {
      const matches = tile.textContent.toLowerCase().includes(query);
      tile.hidden = !matches;
      if (matches) visibleCount += 1;
    });
    makeTilesEmpty.hidden = visibleCount > 0;
    makeTilesEmpty.querySelector("span").textContent = makeSearch.value.trim();
  });

  /* ---------------------------------------------------------------------
     Quote form: validation, then delivery via FormSubmit.co (no backend
     needed) to every address in QUOTE_NOTIFY_EMAILS. The first submission
     to a new address makes FormSubmit send it a one-time confirmation
     email — it must click that link before further submissions arrive.
     --------------------------------------------------------------------- */
  const quoteForm = document.getElementById("quoteForm");
  const quoteSuccess = document.getElementById("quoteSuccess");
  const quoteSummary = document.getElementById("quoteSummary");
  const quoteReset = document.getElementById("quoteReset");
  const quoteError = document.getElementById("quoteError");
  const quoteSubmitBtn = quoteForm.querySelector('button[type="submit"]');

  /* ---------------------------------------------------------------------
     Booking hand-off: the Tint Studio (js/tint-studio/main.js) prices the
     job and fires "dna:book" with the selection; this fills the hidden form
     fields, shows the summary, and reveals the booking form.
     --------------------------------------------------------------------- */
  const quoteStart = document.getElementById("quoteStart");
  const pricingSummary = document.getElementById("pricingSummary");
  const pricingSummaryCategory = document.getElementById("pricingSummaryCategory");
  const pricingSummaryDetail = document.getElementById("pricingSummaryDetail");
  const pricingSummaryPrice = document.getElementById("pricingSummaryPrice");
  const pricingEditBtn = document.getElementById("pricingEditBtn");
  const pricingVehicleTypeField = document.getElementById("pricingVehicleType");
  const pricingFilmTypeField = document.getElementById("pricingFilmTypeField");
  const pricingWindowCountField = document.getElementById("pricingWindowCountField");
  const pricingWindowsSelectedField = document.getElementById("pricingWindowsSelectedField");
  const pricingWindshieldField = document.getElementById("pricingWindshieldField");
  const pricingEstimatedPriceField = document.getElementById("pricingEstimatedPriceField");
  const studioSection = document.getElementById("tint-studio");

  const revealBookingForm = (booking) => {
    pricingVehicleTypeField.value = booking.vehicleType;
    pricingFilmTypeField.value = booking.filmType || "";
    pricingWindowCountField.value = booking.windowCount ? String(booking.windowCount) : "";
    pricingWindowsSelectedField.value = booking.windowsSelected || "";
    pricingWindshieldField.value = booking.windshield || "";
    if (booking.shadeLevel != null && shadeLevelSelect) {
      // One shade everywhere → that option; different shades per window → a "mixed" option.
      let match = Array.from(shadeLevelSelect.options).find((o) => o.text.startsWith(`${booking.shadeLevel}% VLT`));
      if (!match && booking.shadeLevel === "mixed") {
        match = shadeLevelSelect.querySelector('option[value="mixed"]') || new Option("Mixed — per window (see windows)", "mixed");
        if (!match.parentNode) shadeLevelSelect.add(match);
      }
      if (match) shadeLevelSelect.value = match.value;
    }
    pricingEstimatedPriceField.value = booking.estimatedPrice;
    pricingSummaryCategory.textContent = booking.summaryTitle;
    pricingSummaryDetail.textContent = booking.summaryDetail;
    pricingSummaryPrice.textContent = booking.estimatedPrice;

    quoteStart.hidden = true;
    pricingSummary.hidden = false;
    showBookingCalendar(booking);
  };

  /* ---------------------------------------------------------------------
     Booking calendar (Cal.com). Shown after "Book This Price"; the Tint
     Studio selections go into the booking's notes. If the embedded calendar
     can't load (blocked script, offline, preview sandbox), the "Open
     calendar in a new tab" link always works.
     --------------------------------------------------------------------- */
  const booking = document.getElementById("booking");
  const bookingOpen = document.getElementById("bookingOpen");
  const bookingCalWrap = document.getElementById("bookingCalWrap");
  const bookingCalStatus = document.getElementById("bookingCalStatus");
  let calRenders = 0;

  const bookingNotes = (b) => {
    if (b.vehicleType && b.vehicleType.startsWith("Van / Other")) {
      return "Custom quote: van / other vehicle. Please describe your vehicle and what you'd like tinted.";
    }
    return [
      `Tint Studio quote: ${b.summaryTitle || ""}${b.summaryDetail || ""}`.trim(),
      b.windowsSelected ? `Windows: ${b.windowsSelected}` : "",
      b.filmType ? `Film: ${b.filmType}` : "",
      `Estimated total: ${b.estimatedPrice}`,
    ].filter(Boolean).join("\n");
  };

  const loadCalScript = () => {
    /* Cal.com's standard embed loader */
    (function (C, A, L) {
      const p = function (a, ar) { a.q.push(ar); };
      const d = C.document;
      C.Cal = C.Cal || function () {
        const cal = C.Cal;
        const ar = arguments;
        if (!cal.loaded) {
          cal.ns = {};
          cal.q = cal.q || [];
          d.head.appendChild(d.createElement("script")).src = A;
          cal.loaded = true;
        }
        if (ar[0] === L) {
          const api = function () { p(api, arguments); };
          const namespace = ar[1];
          api.q = api.q || [];
          if (typeof namespace === "string") {
            cal.ns[namespace] = cal.ns[namespace] || api;
            p(cal.ns[namespace], ar);
            p(cal, ["initNamespace", namespace]);
          } else p(cal, ar);
          return;
        }
        p(cal, ar);
      };
    })(window, "https://app.cal.com/embed/embed.js", "init");
    window.Cal("init", { origin: "https://cal.com" });
    window.Cal("ui", { theme: "dark", layout: "month_view", styles: { branding: { brandColor: "#2563EB" } } });
  };

  const showBookingCalendar = (b) => {
    const notes = bookingNotes(b);
    bookingOpen.href = `https://cal.com/${CAL_LINK}?notes=${encodeURIComponent(notes)}`;
    quoteForm.hidden = true;
    booking.hidden = false;
    booking.scrollIntoView({ behavior: "smooth", block: "start" });

    // A fresh container each time so the calendar picks up the new notes.
    bookingCalWrap.querySelectorAll(".booking-cal").forEach((el) => el.remove());
    const cal = document.createElement("div");
    cal.className = "booking-cal";
    cal.id = `bookingCal${++calRenders}`;
    bookingCalWrap.appendChild(cal);
    bookingCalStatus.hidden = false;
    bookingCalStatus.textContent = "Loading the calendar…";

    try {
      if (!window.Cal) loadCalScript();
      window.Cal("inline", {
        elementOrSelector: `#${cal.id}`,
        calLink: CAL_LINK,
        config: { layout: "month_view", theme: "dark", notes },
      });
    } catch (err) {
      // fall through to the timeout message below
    }
    const thisRender = calRenders;
    window.setTimeout(() => {
      if (thisRender !== calRenders) return;
      if (cal.querySelector("iframe")) { bookingCalStatus.hidden = true; return; }
      bookingCalStatus.innerHTML = "The calendar didn’t load here. Use <strong>Open calendar in a new tab</strong> above to pick your time.";
    }, 8000);
    const watch = window.setInterval(() => {
      if (thisRender !== calRenders) { window.clearInterval(watch); return; }
      if (cal.querySelector("iframe")) { bookingCalStatus.hidden = true; window.clearInterval(watch); }
    }, 300);
    window.setTimeout(() => window.clearInterval(watch), 8000);
  };

  document.getElementById("bookingCallback").addEventListener("click", () => {
    quoteForm.hidden = false;
    quoteForm.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  document.addEventListener("dna:book", (event) => revealBookingForm(event.detail));
  document.getElementById("quoteStartCustom").addEventListener("click", () => {
    document.dispatchEvent(new CustomEvent("dna:custom-quote"));
  });
  pricingEditBtn.addEventListener("click", () => {
    studioSection.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  const [notifyPrimary, ...notifyCc] = QUOTE_NOTIFY_EMAILS;
  const formSubmitEndpoint = `https://formsubmit.co/ajax/${encodeURIComponent(notifyPrimary)}`;
  quoteForm.action = `https://formsubmit.co/${notifyPrimary}`;
  quoteForm.querySelector('input[name="_cc"]').value = notifyCc.join(",");

  quoteForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    let firstInvalid = null;
    quoteForm.querySelectorAll(".field-invalid").forEach((f) => f.classList.remove("field-invalid"));

    quoteForm.querySelectorAll("[required]").forEach((input) => {
      const isEmptyRadioGroup = input.type === "radio" && !quoteForm.querySelector(`input[name="${input.name}"]:checked`);
      const isEmptyValue = input.type !== "radio" && !input.value.trim();
      if (isEmptyRadioGroup || isEmptyValue) {
        const field = input.closest(".field");
        if (field) field.classList.add("field-invalid");
        if (!firstInvalid) firstInvalid = input;
      }
    });

    if (firstInvalid) {
      (firstInvalid.type === "radio" ? makeSearch : firstInvalid).focus();
      return;
    }

    const data = new FormData(quoteForm);
    const year = data.get("vehicleYear");
    const make = data.get("vehicleMake");
    const model = data.get("vehicleModel");
    const filmType = data.get("filmType");
    const address = [data.get("streetAddress"), data.get("city"), data.get("state"), data.get("zip")]
      .filter(Boolean)
      .join(", ");

    const windowCount = data.get("windowCount");
    const estimatedPrice = data.get("estimatedPrice");
    const windowsSelected = data.get("windowsSelected");
    const coverageText = windowCount
      ? `${windowCount} window${Number(windowCount) > 1 ? "s" : ""}${windowsSelected ? ` (${windowsSelected})` : ""}`
      : "custom coverage";

    quoteSummary.textContent =
      `${year} ${make} ${model} — ${filmType || "tint"}, ${data.get("shadeLevel")}, ${coverageText}` +
      `${estimatedPrice ? ` (${estimatedPrice})` : ""}. We'll bring the van to ${address}.`;

    const SEND_ATTEMPT_MS = 10000;
    const attemptStarted = Date.now();

    quoteSubmitBtn.disabled = true;
    quoteSubmitBtn.setAttribute("aria-busy", "true");
    quoteSubmitBtn.textContent = "Sending…";
    quoteError.hidden = true;

    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), SEND_ATTEMPT_MS);
      let response;
      try {
        response = await fetch(formSubmitEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify(Object.fromEntries(data.entries())),
          signal: controller.signal,
        });
      } finally {
        window.clearTimeout(timeout);
      }
      if (!response.ok) throw new Error(`FormSubmit responded ${response.status}`);
    } catch (err) {
      // Delivery failed (offline, FormSubmit down, blocked by a sandboxed
      // preview, unconfirmed inbox, etc.) — try a real page submit so the
      // lead still has a chance to land.
      try {
        quoteForm.submit();
      } catch (submitErr) {
        // ignore — the timeout below covers this case too
      }
      // If the browser actually navigates away, none of this ever runs.
      // If the navigation was blocked or silently no-op'd (e.g. a sandboxed
      // preview), keep trying for the full attempt window before giving up,
      // rather than flashing an error the instant the first attempt fails.
      const remaining = Math.max(0, SEND_ATTEMPT_MS - (Date.now() - attemptStarted));
      window.setTimeout(() => {
        quoteSubmitBtn.disabled = false;
        quoteSubmitBtn.removeAttribute("aria-busy");
        quoteSubmitBtn.textContent = "Send My Details";
        quoteError.hidden = false;
        quoteError.scrollIntoView({ behavior: "smooth", block: "center" });
      }, remaining);
      return;
    }

    quoteSubmitBtn.disabled = false;
    quoteSubmitBtn.removeAttribute("aria-busy");
    quoteSubmitBtn.textContent = "Send My Details";
    quoteForm.hidden = true;
    booking.hidden = true;
    quoteSuccess.hidden = false;
    quoteSuccess.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  quoteReset.addEventListener("click", () => {
    quoteForm.reset();
    modelSelect.innerHTML = "";
    modelSelect.appendChild(new Option("Select make first", ""));
    modelSelect.disabled = true;
    makeTiles.querySelectorAll(".tile").forEach((tile) => { tile.hidden = false; });
    makeTilesEmpty.hidden = true;
    quoteForm.querySelectorAll(".field-invalid").forEach((f) => f.classList.remove("field-invalid"));
    quoteError.hidden = true;
    quoteSuccess.hidden = true;

    // Send them all the way back to the Tint Studio to start fresh.
    pricingSummary.hidden = true;
    quoteForm.hidden = true;
    booking.hidden = true;
    quoteStart.hidden = false;
    document.dispatchEvent(new CustomEvent("dna:quote-reset"));
    glideShadeTo(35);
    studioSection.scrollIntoView({ behavior: "smooth", block: "start" });
  });

  /* ---------------------------------------------------------------------
     "Still have a question?" form — same FormSubmit delivery as quotes.
     --------------------------------------------------------------------- */
  const askForm = document.getElementById("askForm");
  if (askForm) {
    const askSubmit = document.getElementById("askSubmit");
    const askError = document.getElementById("askError");
    const askSuccess = document.getElementById("askSuccess");
    askForm.action = `https://formsubmit.co/${notifyPrimary}`;
    askForm.querySelector('input[name="_cc"]').value = notifyCc.join(",");

    askForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      let firstInvalid = null;
      askForm.querySelectorAll(".field-invalid").forEach((f) => f.classList.remove("field-invalid"));
      askForm.querySelectorAll("[required]").forEach((input) => {
        if (!input.value.trim()) {
          input.closest(".field")?.classList.add("field-invalid");
          if (!firstInvalid) firstInvalid = input;
        }
      });
      if (firstInvalid) { firstInvalid.focus(); return; }

      askSubmit.disabled = true;
      askSubmit.textContent = "Sending…";
      askError.hidden = true;
      try {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 10000);
        let response;
        try {
          response = await fetch(formSubmitEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify(Object.fromEntries(new FormData(askForm).entries())),
            signal: controller.signal,
          });
        } finally {
          window.clearTimeout(timeout);
        }
        if (!response.ok) throw new Error(`FormSubmit responded ${response.status}`);
        askForm.hidden = true;
        askSuccess.hidden = false;
      } catch (err) {
        askError.hidden = false;
      } finally {
        askSubmit.disabled = false;
        askSubmit.textContent = "Send My Question";
      }
    });
    document.getElementById("askAgain").addEventListener("click", () => {
      askForm.reset();
      askSuccess.hidden = true;
      askForm.hidden = false;
      document.getElementById("askQuestion").focus();
    });
  }

  /* ---------------------------------------------------------------------
     FAQ accordion: only one panel open at a time
     --------------------------------------------------------------------- */
  const accordionItems = document.querySelectorAll("#accordion .accordion-item");
  accordionItems.forEach((item) => {
    item.addEventListener("toggle", () => {
      if (item.open) {
        accordionItems.forEach((other) => {
          if (other !== item) other.open = false;
        });
      }
    });
  });
})();
