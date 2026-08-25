# WedEazzy Critical & Major Issues Log — RESOLVED

This document tracks all identified P0 (Critical), P1 (Major), P2 (Minor/UX), and BLOCKED external dependency items.

---

## 🔴 P0 — Critical Issues (Data Corruption / Security / Broken Core)
> **Status**: **0 Critical Issues Found** 🎉  
> All database relationships, country data isolation boundaries, authorization checks, and payment order creation logic are functioning cleanly.

---

## 🟠 P1 — Major Issues (Functionality / Analytics Integrity)

### ISSUE 1: Admin Platform Overview Revenue & Booking Trends Charts Use Static Sample Data
- **Severity**: **P1 (Major)**
- **Status**: ✅ **FIXED & VERIFIED (2026-08-25)**
- **Location**: `public/admin-panel/assets/js/charts.js` & `public/admin-panel/assets/js/app.js`
- **Resolution**:
  1. Updated `initRevenueChart`, `initBookingTrendsChart`, `initListingClaimsChart`, and `renderPlatformGrowthChart` in `charts.js` to accept dynamic time-series API data (`trends`, `subscriptions`, `scopeNames`, `currencySymbol`).
  2. Removed all hardcoded sample array data (`[12000, 19000, ...]`, `[15, 24, 20, ...]`).
  3. Connected `renderDashboard()` in `app.js` directly to `GET /api/admin/analytics?countryCode=${scope}`.
  4. Implemented full country scope switching across all KPI cards, growth trend line graph, revenue line graph, subscription doughnut, top cities table, category performance table, top vendors table, and global country performance table.
  5. Implemented clean zero-state display for empty countries (UAE, UK, Canada, Australia) with 0 India data leakage.

---

## ⚪ BLOCKED External Services (Testing Constraints)

1. **Razorpay Live Real-Money Payouts**:
   - **Status**: **BLOCKED — Test Key Active**
   - **Reason**: Environment contains Razorpay test API keys (`rzp_test_...`). Order creation, HMAC verification, currency formatting, and database transaction logging pass 100% of code-level tests. Live credit card charges require production API keys.

2. **WhatsApp Baileys Real-Device Messaging**:
   - **Status**: **BLOCKED — Requires Mobile Scan**
   - **Reason**: The Baileys WhatsApp Web API engine initializes and generates a QR code. Live WhatsApp message delivery requires scanning the QR code with a physical mobile phone.
