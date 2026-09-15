(() => {
  "use strict";

  document.getElementById("year").textContent = new Date().getFullYear();

  // Inboxes notified when a quote is submitted, via FormSubmit.co (no backend
  // required). To add more, just add emails here — the form's action and
  // hidden _cc field below are kept in sync with this on load.
  const QUOTE_NOTIFY_EMAILS = ["albadourrami@gmail.com"];

  /* ---------------------------------------------------------------------
     Sticky header
     --------------------------------------------------------------------- */
  const header = document.getElementById("siteHeader");
  const onScroll = () => header.classList.toggle("is-scrolled", window.scrollY > 40);
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

  if (shadeSlider) {
    updateShadePreview(Number(shadeSlider.value));
    shadeSlider.addEventListener("input", () => updateShadePreview(Number(shadeSlider.value)));
    shadePresets.forEach((btn) => {
      btn.addEventListener("click", () => {
        const vlt = Number(btn.dataset.vlt);
        shadeSlider.value = String(vlt);
        updateShadePreview(vlt);
      });
    });
  }

  /* ---------------------------------------------------------------------
     Jump straight to the vehicle selector and focus the first field
     --------------------------------------------------------------------- */
  const vehicleFields = document.getElementById("vehicle-fields");
  const focusVehicleYear = () => {
    const yearField = document.getElementById("vehicleYear");
    if (yearField) yearField.focus({ preventScroll: true });
  };
  document.querySelectorAll('a[href="#vehicle-fields"]').forEach((link) => {
    link.addEventListener("click", () => window.setTimeout(focusVehicleYear, 500));
  });
  if (window.location.hash === "#vehicle-fields" && vehicleFields) {
    window.setTimeout(focusVehicleYear, 500);
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

    quoteSummary.textContent =
      `${year} ${make} ${model} — ${filmType} tint, ${data.get("shadeLevel")}, ${data.get("coverage")}. ` +
      `We'll bring the van to ${address}.`;

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
    quoteForm.hidden = false;
    quoteForm.scrollIntoView({ behavior: "smooth", block: "start" });
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
