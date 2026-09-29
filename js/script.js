(() => {
  "use strict";

  document.getElementById("year").textContent = new Date().getFullYear();

  // Inboxes notified when a quote is submitted, via FormSubmit.co (no backend
  // required). To add more, just add emails here — the form's action and
  // hidden _cc field below are kept in sync with this on load.
  const QUOTE_NOTIFY_EMAILS = ["albadourrami@gmail.com"];

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
     Interactive shade preview: slider + presets tint the car's windows live
     --------------------------------------------------------------------- */
  const shadeSlider = document.getElementById("shadeSlider");
  const shadeValue = document.getElementById("shadeValue");
  const shadeDesc = document.getElementById("shadeDesc");
  const shadeTintOverlay = document.getElementById("shadeTintOverlay");
  const shadePresets = document.querySelectorAll(".shade-preset");

  const shadeDescriptionFor = (vlt) => {
    if (vlt >= 60) return "Light — near factory glass";
    if (vlt >= 42) return "Light tint, subtle heat cut";
    if (vlt >= 27) return "Most popular daily-driver shade";
    if (vlt >= 12) return "Dark, high privacy";
    return "Limo black — maximum privacy";
  };

  const updateShadePreview = (vlt) => {
    const opacity = 0.9 - ((vlt - 5) / 65) * 0.84;
    shadeTintOverlay.style.opacity = opacity.toFixed(2);
    shadeValue.textContent = `${vlt}% VLT`;
    shadeDesc.textContent = shadeDescriptionFor(vlt);
    shadePresets.forEach((btn) => btn.classList.toggle("is-active", Number(btn.dataset.vlt) === vlt));
  };

  // The only VLT percentages we actually offer. The slider can be dragged
  // to any value in between for feel, but always glides to the nearest of
  // these on release, so it's clear those are the only real options.
  const ALLOWED_SHADES = [5, 20, 35, 70];
  const nearestAllowedShade = (vlt) =>
    ALLOWED_SHADES.reduce((closest, v) => (Math.abs(v - vlt) < Math.abs(closest - vlt) ? v : closest));

  let shadeGlideFrame = null;
  const glideShadeTo = (target, duration = 260) => {
    if (shadeGlideFrame) cancelAnimationFrame(shadeGlideFrame);
    const start = Number(shadeSlider.value);
    if (start === target) {
      updateShadePreview(target);
      return;
    }
    const startTime = performance.now();
    const easeOutCubic = (t) => 1 - (1 - t) ** 3;
    const step = (now) => {
      const t = Math.min(1, (now - startTime) / duration);
      const value = Math.round(start + (target - start) * easeOutCubic(t));
      shadeSlider.value = String(value);
      updateShadePreview(value);
      if (t < 1) {
        shadeGlideFrame = requestAnimationFrame(step);
      } else {
        shadeGlideFrame = null;
      }
    };
    shadeGlideFrame = requestAnimationFrame(step);
  };

  if (shadeSlider) {
    updateShadePreview(Number(shadeSlider.value));

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
  }

  /* ---------------------------------------------------------------------
     Jump straight to the pricing calculator and focus the first option
     --------------------------------------------------------------------- */
  const pricingCalculatorEl = document.getElementById("pricing-calculator");
  const focusPricingCategory = () => {
    const firstTile = document.querySelector('input[name="pricingCategory"]');
    if (firstTile) firstTile.focus({ preventScroll: true });
  };
  document.querySelectorAll('a[href="#pricing-calculator"]').forEach((link) => {
    link.addEventListener("click", () => window.setTimeout(focusPricingCategory, 500));
  });
  if (window.location.hash === "#pricing-calculator" && pricingCalculatorEl) {
    window.setTimeout(focusPricingCategory, 500);
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
     Pricing calculator: instant price by vehicle type, film, and window
     count, then hands off into the booking form above.
     --------------------------------------------------------------------- */
  const PRICING = {
    sedan: {
      label: "Sedan / Coupe",
      Carbon: { perWindow: 50, bundle6: 275 },
      Ceramic: { perWindow: 85, bundle6: 499 },
    },
    suv_truck: {
      label: "SUV / Truck",
      Carbon: { perWindow: 50, bundle6: 299 },
      Ceramic: { perWindow: 90, bundle6: 525 },
    },
  };
  const WINDOW_COUNTS = [
    { count: 2, example: "e.g. both front doors" },
    { count: 3, example: "e.g. front doors + windshield strip" },
    { count: 4, example: "e.g. all four doors" },
    { count: 5, example: "e.g. four doors + rear glass" },
    { count: 6, example: "Full vehicle — best value" },
  ];

  const formatPrice = (n) => `$${Math.round(n)}`;
  const pricingWindowPrice = (category, film, count) => {
    const rates = PRICING[category][film];
    return Math.round(count === 6 ? rates.bundle6 : rates.perWindow * count);
  };
  const getCheckedValue = (name) => document.querySelector(`input[name="${name}"]:checked`)?.value || "";

  const pricingStepFilm = document.getElementById("pricingStepFilm");
  const pricingStepWindows = document.getElementById("pricingStepWindows");
  const pricingStepCustom = document.getElementById("pricingStepCustom");
  const pricingWindowOptions = document.getElementById("pricingWindowOptions");
  const pricingResult = document.getElementById("pricingResult");
  const pricingResultLabel = document.getElementById("pricingResultLabel");
  const pricingResultPrice = document.getElementById("pricingResultPrice");
  const pricingResultNote = document.getElementById("pricingResultNote");
  const pricingContinueBtn = document.getElementById("pricingContinueBtn");
  const pricingSummary = document.getElementById("pricingSummary");
  const pricingSummaryCategory = document.getElementById("pricingSummaryCategory");
  const pricingSummaryDetail = document.getElementById("pricingSummaryDetail");
  const pricingSummaryPrice = document.getElementById("pricingSummaryPrice");
  const pricingEditBtn = document.getElementById("pricingEditBtn");
  const pricingVehicleTypeField = document.getElementById("pricingVehicleType");
  const pricingFilmTypeField = document.getElementById("pricingFilmTypeField");
  const pricingWindowCountField = document.getElementById("pricingWindowCountField");
  const pricingEstimatedPriceField = document.getElementById("pricingEstimatedPriceField");

  const renderWindowOptions = (category, film) => {
    const previouslySelected = getCheckedValue("pricingWindows");
    pricingWindowOptions.innerHTML = "";
    WINDOW_COUNTS.forEach(({ count, example }, index) => {
      const price = pricingWindowPrice(category, film, count);
      const label = document.createElement("label");
      label.className = "pricing-window-pill pricing-pop-in";
      label.style.animationDelay = `${index * 45}ms`;

      const input = document.createElement("input");
      input.type = "radio";
      input.name = "pricingWindows";
      input.value = String(count);
      if (String(count) === previouslySelected) input.checked = true;

      const span = document.createElement("span");
      const countSpan = document.createElement("span");
      countSpan.className = "pricing-window-count";
      countSpan.textContent = `${count} Window${count > 1 ? "s" : ""}`;
      const priceSpan = document.createElement("span");
      priceSpan.className = "pricing-window-price";
      priceSpan.textContent = formatPrice(price);
      const exampleSpan = document.createElement("span");
      exampleSpan.className = "pricing-window-example";
      exampleSpan.textContent = example;
      span.append(countSpan, priceSpan, exampleSpan);

      label.append(input, span);
      pricingWindowOptions.appendChild(label);
    });
  };

  let priceAnimFrame = null;
  let lastDisplayedPrice = null;
  const animatePriceTo = (el, target, duration = 400) => {
    if (priceAnimFrame) cancelAnimationFrame(priceAnimFrame);
    const start = lastDisplayedPrice ?? 0;
    lastDisplayedPrice = target;
    el.classList.remove("pricing-price-bump");
    void el.offsetWidth; // restart the bump animation even if it's already mid-flight
    el.classList.add("pricing-price-bump");
    if (start === target) {
      el.textContent = formatPrice(target);
      return;
    }
    const startTime = performance.now();
    const easeOutCubic = (t) => 1 - (1 - t) ** 3;
    const step = (now) => {
      const t = Math.min(1, (now - startTime) / duration);
      el.textContent = formatPrice(start + (target - start) * easeOutCubic(t));
      if (t < 1) {
        priceAnimFrame = requestAnimationFrame(step);
      } else {
        priceAnimFrame = null;
        el.textContent = formatPrice(target);
      }
    };
    priceAnimFrame = requestAnimationFrame(step);
  };

  const updatePricingResult = () => {
    const category = getCheckedValue("pricingCategory");
    const film = getCheckedValue("pricingFilm");
    const windowCountStr = getCheckedValue("pricingWindows");

    pricingStepFilm.hidden = !category || category === "van_other";
    pricingStepCustom.hidden = category !== "van_other";

    if (!category) {
      pricingStepWindows.hidden = true;
      pricingResult.hidden = true;
      return;
    }

    if (category === "van_other") {
      pricingStepWindows.hidden = true;
      pricingResult.hidden = false;
      pricingResultLabel.textContent = "Van / Other";
      pricingResultPrice.textContent = "Custom Quote";
      lastDisplayedPrice = null;
      pricingResultNote.textContent = "We'll confirm exact pricing after a quick look at your vehicle's glass.";
      pricingContinueBtn.textContent = "Continue — Get My Custom Quote";
      return;
    }

    if (!film) {
      pricingStepWindows.hidden = true;
      pricingResult.hidden = true;
      return;
    }

    pricingStepWindows.hidden = false;
    renderWindowOptions(category, film);

    if (!getCheckedValue("pricingWindows")) {
      pricingResult.hidden = true;
      return;
    }

    const windowCount = Number(getCheckedValue("pricingWindows"));
    const price = pricingWindowPrice(category, film, windowCount);
    pricingResult.hidden = false;
    pricingResultLabel.textContent = `${PRICING[category].label} · ${film} · ${windowCount} Window${windowCount > 1 ? "s" : ""}`;
    animatePriceTo(pricingResultPrice, price);
    pricingResultNote.textContent =
      windowCount === 6
        ? "Full-vehicle bundle price — our best per-window value."
        : `${windowCount} window${windowCount > 1 ? "s" : ""} × ${formatPrice(PRICING[category][film].perWindow)} per window.`;
    pricingContinueBtn.textContent = "Book This Price";
  };

  const filmCompareCards = document.querySelectorAll(".film-compare-card");
  const updateFilmCompareHighlight = () => {
    const film = getCheckedValue("pricingFilm");
    filmCompareCards.forEach((card) => card.classList.toggle("is-selected", card.dataset.film === film));
  };

  document.querySelectorAll('input[name="pricingCategory"], input[name="pricingFilm"]').forEach((input) => {
    input.addEventListener("change", () => {
      updatePricingResult();
      updateFilmCompareHighlight();
    });
  });
  pricingWindowOptions.addEventListener("change", (event) => {
    if (event.target.name === "pricingWindows") updatePricingResult();
  });

  const revealBookingForm = () => {
    const category = getCheckedValue("pricingCategory");
    const film = getCheckedValue("pricingFilm");
    const windowCountStr = getCheckedValue("pricingWindows");

    if (category === "van_other") {
      pricingVehicleTypeField.value = "Van / Other (Custom Quote)";
      pricingFilmTypeField.value = "";
      pricingWindowCountField.value = "";
      pricingEstimatedPriceField.value = "Custom Quote";
      pricingSummaryCategory.textContent = "Van / Other";
      pricingSummaryDetail.textContent = " — Custom Quote";
      pricingSummaryPrice.textContent = "Custom Quote";
    } else {
      const windowCount = Number(windowCountStr);
      const price = pricingWindowPrice(category, film, windowCount);
      pricingVehicleTypeField.value = PRICING[category].label;
      pricingFilmTypeField.value = film;
      pricingWindowCountField.value = windowCountStr;
      pricingEstimatedPriceField.value = formatPrice(price);
      pricingSummaryCategory.textContent = PRICING[category].label;
      pricingSummaryDetail.textContent = ` — ${film}, ${windowCount} Window${windowCount > 1 ? "s" : ""}`;
      pricingSummaryPrice.textContent = formatPrice(price);
    }

    pricingSummary.hidden = false;
    quoteForm.hidden = false;
    quoteForm.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  pricingContinueBtn.addEventListener("click", revealBookingForm);
  pricingEditBtn.addEventListener("click", () => {
    pricingCalculatorEl.scrollIntoView({ behavior: "smooth", block: "start" });
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
    const coverageText = windowCount ? `${windowCount} window${Number(windowCount) > 1 ? "s" : ""}` : "custom coverage";

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
        quoteSubmitBtn.textContent = "Get My Free Quote";
        quoteError.hidden = false;
        quoteError.scrollIntoView({ behavior: "smooth", block: "center" });
      }, remaining);
      return;
    }

    quoteSubmitBtn.disabled = false;
    quoteSubmitBtn.removeAttribute("aria-busy");
    quoteSubmitBtn.textContent = "Get My Free Quote";
    quoteForm.hidden = true;
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

    // Send them all the way back to the pricing calculator to start fresh.
    document.querySelectorAll('input[name="pricingCategory"], input[name="pricingFilm"]').forEach((input) => {
      input.checked = false;
    });
    pricingWindowOptions.innerHTML = "";
    pricingStepFilm.hidden = true;
    pricingStepWindows.hidden = true;
    pricingStepCustom.hidden = true;
    pricingResult.hidden = true;
    pricingSummary.hidden = true;
    lastDisplayedPrice = null;
    quoteForm.hidden = true;
    pricingCalculatorEl.scrollIntoView({ behavior: "smooth", block: "start" });
  });

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
