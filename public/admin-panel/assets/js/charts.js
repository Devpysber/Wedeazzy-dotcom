/**
 * WedEazzy Modular Admin Panel - Dynamic Charts Engine
 * Creates beautiful, theme-aware responsive data visualizations using Chart.js.
 * All datasets are strictly live-data-driven with zero hardcoded sample data.
 */

window.activeCharts = {};

const WedEazzyCharts = {
  // Clear any existing chart instances to avoid overlap errors on SPA navigations
  destroyAll() {
    Object.keys(window.activeCharts).forEach(key => {
      if (window.activeCharts[key]) {
        try { window.activeCharts[key].destroy(); } catch (e) {}
        window.activeCharts[key] = null;
      }
    });
    window.activeCharts = {};
  },

  renderAll() {
    Object.keys(window.activeCharts || {}).forEach(key => {
      if (window.activeCharts[key] && typeof window.activeCharts[key].resize === 'function') {
        try { window.activeCharts[key].resize(); window.activeCharts[key].update(); } catch (e) {}
      }
    });
  },

  // Read current CSS variables to match exact theme states dynamically
  getThemeColors() {
    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    return {
      isDark,
      gridColor: isDark ? "rgba(30, 34, 48, 0.6)" : "rgba(229, 231, 235, 0.6)",
      textColor: isDark ? "#9ca3af" : "#4b5563",
      brandRose: "#DC1F30",
      brandRoseLight: "rgba(220, 31, 48, 0.15)",
      brandRoseFade: "rgba(220, 31, 48, 0.0)",
      brandGold: isDark ? "#eab308" : "#d4af37",
      brandGoldLight: isDark ? "rgba(234, 179, 8, 0.15)" : "rgba(212, 175, 55, 0.15)",
      brandGoldFade: "rgba(234, 179, 8, 0.0)",
      brandBlue: "#3b82f6",
      brandBlueLight: "rgba(59, 130, 246, 0.15)",
      brandGreen: "#10b981",
      brandGreenLight: "rgba(16, 185, 129, 0.15)"
    };
  },

  // Dynamic Chart 1: Revenue Line Graph with Linear Area Gradient
  initRevenueChart(canvas, trends, currencySymbol = '₹') {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const colors = this.getThemeColors();

    if (window.activeCharts["revenue"]) {
      try { window.activeCharts["revenue"].destroy(); } catch (e) {}
    }

    const labels = (trends && trends.months) || ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const data = (trends && trends.revenue) || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    const gradient = ctx.createLinearGradient(0, 0, 0, 300);
    gradient.addColorStop(0, colors.brandRoseLight);
    gradient.addColorStop(1, colors.brandRoseFade);

    window.activeCharts["revenue"] = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [{
          label: `Revenue (${currencySymbol})`,
          data: data,
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
            usePointStyle: true,
            callbacks: {
              label: (context) => ` Revenue: ${currencySymbol}${context.parsed.y.toLocaleString()}`
            }
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
              callback: (value) => `${currencySymbol}${value.toLocaleString()}`
            }
          }
        }
      }
    });
  },

  // Dynamic Chart 2: Event Share Doughnut Chart
  initEventShareChart(canvas, bookingsOverview) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const colors = this.getThemeColors();

    if (window.activeCharts["eventShare"]) {
      try { window.activeCharts["eventShare"].destroy(); } catch (e) {}
    }

    const b = bookingsOverview || { confirmed: 0, pending: 0, cancelled: 0, completed: 0 };
    const labels = ["Confirmed", "Pending", "Completed", "Cancelled"];
    const data = [b.confirmed || 0, b.pending || 0, b.completed || 0, b.cancelled || 0];

    window.activeCharts["eventShare"] = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: [colors.brandGreen, colors.brandGold, colors.brandBlue, colors.brandRose],
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

  // Dynamic Chart 3: Vendors by Category Bar Chart
  initVendorsChart(canvas, categoryPerformance) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const colors = this.getThemeColors();

    if (window.activeCharts["vendors"]) {
      try { window.activeCharts["vendors"].destroy(); } catch (e) {}
    }

    const cats = Array.isArray(categoryPerformance) ? categoryPerformance.slice(0, 8) : [];
    const labels = cats.map(c => c.category);
    const data = cats.map(c => c.listings);

    window.activeCharts["vendors"] = new Chart(ctx, {
      type: "bar",
      data: {
        labels: labels.length ? labels : ["No Categories"],
        datasets: [{
          label: "Listings",
          data: data.length ? data : [0],
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

  // Dynamic Chart 4: Monthly Bookings Trend Graph
  initBookingTrendsChart(canvas, trends) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const colors = this.getThemeColors();

    if (window.activeCharts["bookingTrends"]) {
      try { window.activeCharts["bookingTrends"].destroy(); } catch (e) {}
    }

    const labels = (trends && trends.months) || ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const data = (trends && trends.bookings) || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

    const gradient = ctx.createLinearGradient(0, 0, 0, 240);
    gradient.addColorStop(0, colors.brandGoldLight);
    gradient.addColorStop(1, colors.brandGoldFade);

    window.activeCharts["bookingTrends"] = new Chart(ctx, {
      type: "line",
      data: {
        labels: labels,
        datasets: [{
          label: "Bookings",
          data: data,
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
            ticks: { color: colors.textColor, font: { family: "Inter", size: 10 }, stepSize: 1 }
          }
        }
      }
    });
  },

  // Dynamic Chart 5: Subscriptions & Verification Distribution
  initListingClaimsChart(canvas, subscriptions) {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const colors = this.getThemeColors();

    if (window.activeCharts["listingClaims"]) {
      try { window.activeCharts["listingClaims"].destroy(); } catch (e) {}
    }

    const sub = subscriptions || { free: 0, premium: 0, featured: 0 };
    const labels = ["Free Plan", "Premium Plan", "Featured Plan"];
    const data = [sub.free || 0, sub.premium || 0, sub.featured || 0];

    window.activeCharts["listingClaims"] = new Chart(ctx, {
      type: "polarArea",
      data: {
        labels: labels,
        datasets: [{
          data: data,
          backgroundColor: ["rgba(107, 114, 128, 0.7)", "rgba(59, 130, 246, 0.7)", "rgba(220, 31, 48, 0.7)"],
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
  },

  // Dynamic BI Chart: Interactive Time-Series Platform Growth Chart
  renderPlatformGrowthChart(canvasId, trends, activeMetric = 'inquiries', scopeName = 'India') {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const colors = this.getThemeColors();

    if (window.activeCharts['platformGrowth']) {
      try { window.activeCharts['platformGrowth'].destroy(); } catch (e) {}
      window.activeCharts['platformGrowth'] = null;
    }

    const metricLabels = {
      revenue: `Monthly Revenue — ${scopeName}`,
      bookings: `Monthly Bookings — ${scopeName}`,
      inquiries: `Monthly Enquiries — ${scopeName}`,
      listings: `Listings Growth — ${scopeName}`,
      vendors: `Claimed Vendors — ${scopeName}`,
      subscriptions: `Subscriptions Growth — ${scopeName}`
    };

    const metricColors = {
      revenue: colors.brandRose,
      bookings: colors.brandGold,
      inquiries: colors.brandBlue,
      listings: '#8b5cf6',
      vendors: '#0d9488',
      subscriptions: colors.brandGreen
    };

    const labels = (trends && trends.months) || ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const selectedData = (trends && trends[activeMetric]) || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const color = metricColors[activeMetric] || colors.brandRose;

    const gradient = ctx.createLinearGradient(0, 0, 0, 260);
    gradient.addColorStop(0, color + '33');
    gradient.addColorStop(1, color + '00');

    window.activeCharts['platformGrowth'] = new Chart(ctx, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: metricLabels[activeMetric] || `Growth — ${scopeName}`,
          data: selectedData,
          borderColor: color,
          borderWidth: 3,
          backgroundColor: gradient,
          fill: true,
          tension: 0.35,
          pointBackgroundColor: color,
          pointRadius: 4,
          pointHoverRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            padding: 10,
            backgroundColor: colors.isDark ? '#0f111a' : '#ffffff',
            titleColor: colors.isDark ? '#ffffff' : '#111827',
            bodyColor: colors.isDark ? '#9ca3af' : '#4b5563',
            borderColor: colors.gridColor,
            borderWidth: 1
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: colors.textColor, font: { family: 'Inter', size: 10 } }
          },
          y: {
            grid: { color: colors.gridColor },
            ticks: { color: colors.textColor, font: { family: 'Inter', size: 10 }, beginAtZero: true }
          }
        }
      }
    });
  }
};

window.WedEazzyCharts = WedEazzyCharts;
