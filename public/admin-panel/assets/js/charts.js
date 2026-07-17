/**
 * WedEazzy Modular Admin Panel - Charts Engine
 * Creates beautiful, theme-aware responsive data visualizations using Chart.js.
 * Implements linear gradient area fills and full canvas management.
 */

window.activeCharts = {};

const WedEazzyCharts = {
  // Clear any existing chart instances to avoid overlap errors on SPA navigations
  destroyAll() {
    Object.keys(window.activeCharts).forEach(key => {
      if (window.activeCharts[key]) {
        window.activeCharts[key].destroy();
        window.activeCharts[key] = null;
      }
    });
    window.activeCharts = {};
  },

  // Read current CSS variables to match exact theme states dynamically
  getThemeColors() {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    return {
      isDark,
      gridColor: isDark ? "rgba(30, 34, 48, 0.6)" : "rgba(229, 231, 235, 0.6)",
      textColor: isDark ? "#9ca3af" : "#4b5563",
      brandRose: "#f43f5e",
      brandRoseLight: "rgba(244, 63, 94, 0.15)",
      brandRoseFade: "rgba(244, 63, 94, 0.0)",
      brandGold: isDark ? "#eab308" : "#d4af37",
      brandGoldLight: isDark ? "rgba(234, 179, 8, 0.15)" : "rgba(212, 175, 55, 0.15)",
      brandGoldFade: "rgba(234, 179, 8, 0.0)",
      brandBlue: "#3b82f6",
      brandBlueLight: "rgba(59, 130, 246, 0.15)",
      brandGreen: "#10b981",
      brandGreenLight: "rgba(16, 185, 129, 0.15)"
    };
  },

  // Main coordinator
  renderAll() {
    this.destroyAll();

    const canvasIds = ["chartRevenue", "chartEventShare", "chartVendors", "chartBookingTrends", "chartListingClaims"];
    
    // Check if canvases are present in the DOM before rendering
    canvasIds.forEach(id => {
      const canvas = document.getElementById(id);
      if (canvas) {
        if (id === "chartRevenue") this.initRevenueChart(canvas);
        if (id === "chartEventShare") this.initEventShareChart(canvas);
        if (id === "chartVendors") this.initVendorsChart(canvas);
        if (id === "chartBookingTrends") this.initBookingTrendsChart(canvas);
        if (id === "chartListingClaims") this.initListingClaimsChart(canvas);
      }
    });
  },

  // Chart 1: Revenue Line Graph with Linear Area Gradient
  initRevenueChart(canvas) {
    const ctx = canvas.getContext("2d");
    const colors = this.getThemeColors();

    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, colors.brandRoseLight);
    gradient.addColorStop(1, colors.brandRoseFade);

    window.activeCharts["revenue"] = new Chart(ctx, {
      type: "line",
      data: {
        labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"],
        datasets: [{
          label: "Revenue ($)",
          data: [12000, 19000, 15000, 28000, 35000, 42000, 48000, 54000],
          borderColor: colors.brandRose,
          borderWidth: 3,
          backgroundColor: gradient,
          fill: true,
          tension: 0.35,
          pointBackgroundColor: colors.brandRose,
          pointHoverRadius: 7,
          pointRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            padding: 12,
            backgroundColor: colors.isDark ? "#0f111a" : "#ffffff",
            titleColor: colors.isDark ? "#ffffff" : "#111827",
            bodyColor: colors.isDark ? "#9ca3af" : "#4b5563",
            borderColor: colors.gridColor,
            borderWidth: 1,
            boxPadding: 4,
            usePointStyle: true
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: colors.textColor, font: { family: "Inter", size: 10 } }
          },
          y: {
            grid: { color: colors.gridColor },
            ticks: { color: colors.textColor, font: { family: "Inter", size: 10 } }
          }
        }
      }
    });
  },

  // Chart 2: Event Share Doughnut Chart (Wedding, Haldi, Sangeet, etc.)
  initEventShareChart(canvas) {
    const ctx = canvas.getContext("2d");
    const colors = this.getThemeColors();
    const store = window.WedEazzyStore.get();
    
    // Aggregate data dynamically from store bookings
    const eventCounts = {};
    store.bookings.forEach(b => {
      eventCounts[b.eventType] = (eventCounts[b.eventType] || 0) + 1;
    });

    const labels = Object.keys(eventCounts).length ? Object.keys(eventCounts) : ["Wedding", "Sangeet", "Reception", "Haldi"];
    const data = Object.values(eventCounts).length ? Object.values(eventCounts) : [3, 1, 1, 1];

    window.activeCharts["eventShare"] = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: [colors.brandRose, colors.brandGold, colors.brandBlue, colors.brandGreen, "#8b5cf6"],
          borderWidth: colors.isDark ? 2 : 1,
          borderColor: colors.isDark ? "#0f111a" : "#ffffff"
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              color: colors.textColor,
              font: { family: "Inter", size: 11, weight: "500" },
              padding: 14,
              boxWidth: 10
            }
          },
          tooltip: {
            padding: 10,
            backgroundColor: colors.isDark ? "#0f111a" : "#ffffff",
            titleColor: colors.isDark ? "#ffffff" : "#111827",
            bodyColor: colors.isDark ? "#9ca3af" : "#4b5563",
            borderColor: colors.gridColor,
            borderWidth: 1
          }
        },
        cutout: "70%"
      }
    });
  },

  // Chart 3: Vendors by Category Bar Chart
  initVendorsChart(canvas) {
    const ctx = canvas.getContext("2d");
    const colors = this.getThemeColors();
    const store = window.WedEazzyStore.get();

    // Aggregate vendors by category
    const catMap = {};
    store.vendors.forEach(v => {
      catMap[v.category] = (catMap[v.category] || 0) + 1;
    });

    const labels = Object.keys(catMap).length ? Object.keys(catMap) : ["Catering", "Decor", "Photography", "Makeup", "Entertainment"];
    const data = Object.values(catMap).length ? Object.values(catMap) : [1, 1, 1, 1, 1];

    window.activeCharts["vendors"] = new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: colors.brandBlue,
          borderRadius: 6,
          maxBarThickness: 24
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            padding: 10,
            backgroundColor: colors.isDark ? "#0f111a" : "#ffffff",
            titleColor: colors.isDark ? "#ffffff" : "#111827",
            bodyColor: colors.isDark ? "#9ca3af" : "#4b5563",
            borderColor: colors.gridColor,
            borderWidth: 1
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: colors.textColor, font: { family: "Inter", size: 10 } }
          },
          y: {
            grid: { color: colors.gridColor },
            ticks: { 
              color: colors.textColor, 
              font: { family: "Inter", size: 10 },
              stepSize: 1
            }
          }
        }
      }
    });
  },

  // Chart 4: Monthly Bookings (Trend Graph with Linear Gold Area)
  initBookingTrendsChart(canvas) {
    const ctx = canvas.getContext("2d");
    const colors = this.getThemeColors();

    const gradient = ctx.createLinearGradient(0, 0, 0, 240);
    gradient.addColorStop(0, colors.brandGoldLight);
    gradient.addColorStop(1, colors.brandGoldFade);

    window.activeCharts["bookingTrends"] = new Chart(ctx, {
      type: "line",
      data: {
        labels: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"],
        datasets: [{
          label: "Bookings",
          data: [15, 24, 20, 32, 45, 52, 60, 68],
          borderColor: colors.brandGold,
          borderWidth: 3,
          backgroundColor: gradient,
          fill: true,
          tension: 0.35,
          pointBackgroundColor: colors.brandGold,
          pointRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            padding: 10,
            backgroundColor: colors.isDark ? "#0f111a" : "#ffffff",
            titleColor: colors.isDark ? "#ffffff" : "#111827",
            bodyColor: colors.isDark ? "#9ca3af" : "#4b5563",
            borderColor: colors.gridColor,
            borderWidth: 1
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: colors.textColor, font: { family: "Inter", size: 10 } }
          },
          y: {
            grid: { color: colors.gridColor },
            ticks: { color: colors.textColor, font: { family: "Inter", size: 10 } }
          }
        }
      }
    });
  },

  // Chart 5: Listing Claims and verification details
  initListingClaimsChart(canvas) {
    const ctx = canvas.getContext("2d");
    const colors = this.getThemeColors();
    const store = window.WedEazzyStore.get();

    let verified = 0;
    let unclaimed = 0;
    let requested = 0;

    store.venues.forEach(v => {
      if (v.claims === "Verified Owner") verified++;
      else if (v.claims === "Claim Requested") requested++;
      else unclaimed++;
    });

    store.vendors.forEach(v => {
      if (v.claims === "Verified Owner") verified++;
      else if (v.claims === "Claim Requested") requested++;
      else unclaimed++;
    });

    window.activeCharts["listingClaims"] = new Chart(ctx, {
      type: "polarArea",
      data: {
        labels: ["Verified Owner", "Unclaimed", "Claim Requested"],
        datasets: [{
          data: [verified, unclaimed, requested],
          backgroundColor: ["rgba(16, 185, 129, 0.7)", "rgba(107, 114, 128, 0.7)", "rgba(217, 119, 6, 0.7)"],
          borderColor: colors.isDark ? "#0f111a" : "#ffffff",
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              color: colors.textColor,
              font: { family: "Inter", size: 10, weight: "500" },
              boxWidth: 10
            }
          }
        },
        scales: {
          r: {
            grid: { color: colors.gridColor },
            angleLines: { color: colors.gridColor },
            pointLabels: { display: false },
            ticks: { display: false }
          }
        }
      }
    });
  }
};

window.WedEazzyCharts = WedEazzyCharts;
