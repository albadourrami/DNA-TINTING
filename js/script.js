(() => {
  "use strict";

  document.getElementById("year").textContent = new Date().getFullYear();

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

  // Original geometric marks (not traced from any manufacturer's logo) used
  // as each make tile's badge — see MAKE_BADGES in vehicle-data.js.
  const BADGE_SHAPES = {
    ring: '<circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="2.4"/>',
    oval: '<ellipse cx="12" cy="12" rx="9" ry="6" fill="none" stroke="currentColor" stroke-width="2.4"/>',
    star: '<path d="M12 2.5 14.8 9.3 22 10 16.6 14.8 18.3 21.8 12 18 5.7 21.8 7.4 14.8 2 10 9.2 9.3 Z" fill="currentColor"/>',
    chevron: '<path d="M4 16 12 8 20 16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>',
    diamond: '<rect x="6" y="6" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.4" transform="rotate(45 12 12)"/>',
    hex: '<path d="M12 3 19.8 7.5 19.8 16.5 12 21 4.2 16.5 4.2 7.5 Z" fill="none" stroke="currentColor" stroke-width="2"/>',
    shield: '<path d="M12 3 19 6 V12 C19 17 15.5 20 12 21 C8.5 20 5 17 5 12 V6 Z" fill="none" stroke="currentColor" stroke-width="2"/>',
    quarter: '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 3 A9 9 0 0 1 21 12 L12 12 Z" fill="currentColor"/><path d="M12 21 A9 9 0 0 1 3 12 L12 12 Z" fill="currentColor"/>',
    arrowcircle: '<circle cx="11" cy="13" r="7" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M15.5 8.5 20.5 3.5M20.5 3.5H15.5M20.5 3.5V8.5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>',
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
    icon.className = "tile-icon";
    icon.setAttribute("aria-hidden", "true");

    const badge = MAKE_BADGES[make] || { shape: "text", color: "#64748B" };
    icon.style.color = badge.color;
    icon.style.background = `color-mix(in srgb, ${badge.color} 14%, white)`;
    if (badge.shape !== "text" && BADGE_SHAPES[badge.shape]) {
      icon.innerHTML = `<svg class="tile-badge-svg" viewBox="0 0 24 24">${BADGE_SHAPES[badge.shape]}</svg>`;
    } else {
      icon.textContent = badge.text || makeInitials(make);
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
     Quote form: validation + local success state
     NOTE: this form has no backend wired up. Point its submit handler at
     your email/CRM endpoint (Formspree, HubSpot, custom API, etc.) to
     receive real leads instead of only showing this confirmation screen.
     --------------------------------------------------------------------- */
  const quoteForm = document.getElementById("quoteForm");
  const quoteSuccess = document.getElementById("quoteSuccess");
  const quoteSummary = document.getElementById("quoteSummary");
  const quoteReset = document.getElementById("quoteReset");

  quoteForm.addEventListener("submit", (event) => {
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
    const serviceLocation = data.get("serviceLocation");
    const address = [data.get("streetAddress"), data.get("city"), data.get("state"), data.get("zip")]
      .filter(Boolean)
      .join(", ");

    quoteSummary.textContent =
      `${year} ${make} ${model} — ${filmType} tint, ${data.get("shadeLevel")}, ${data.get("coverage")}. ` +
      `${serviceLocation} at ${address}.`;

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
