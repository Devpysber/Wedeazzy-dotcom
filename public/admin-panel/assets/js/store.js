/**
 * WedEazzy Modular Admin Panel - Local State & Database Synchronization Engine
 * Synchronizes dashboard state dynamically with Express/Prisma APIs.
 */

const API_BASE = (location.hostname === 'localhost' || location.hostname === '127.0.0.1')
  ? 'http://localhost:4000'
  : window.location.origin;

const DEFAULT_MOCK_DATA = {
  stats: {
    pendingBookings: 0,
    inProgressBookings: 0,
    confirmedBookings: 0,
    cancelledBookings: 0,
    venuesCount: 0,
    vendorsCount: 0,
    servicesCount: 11,
    usersCount: 0,
    businessClaims: 0,
    regionsCount: 7,
    citiesCount: 7
  },
  bookings: [],
  vendors: [],
  venues: [],
  users: [],
  payments: [],
  whatsappLogs: [],
  notifications: [],
  logs: []
};

// Full store (including the large vendors/users/bookings lists) lives here,
// in memory only. With 13,000+ vendors alone, JSON-serializing the whole
// store blows past localStorage's ~5-10MB per-origin quota — setItem() then
// throws QuotaExceededError, which used to abort the entire save() (see
// save() below), silently discarding freshly-synced data and leaving every
// admin page stuck showing the empty DEFAULT_MOCK_DATA arrays. Only the
// small, bounded pieces (stats, notifications) get persisted to
// localStorage now, so a page reload still has something to show
// immediately while sync() repopulates the large lists within a few seconds.
let memoryStore = null;

// Global Store Wrapper
const WedEazzyStore = {
  init() {
    if (!memoryStore) {
      let persisted = {};
      try {
        persisted = JSON.parse(localStorage.getItem("wedeazzy_admin_store")) || {};
      } catch (e) {
        persisted = {};
      }
      memoryStore = { ...DEFAULT_MOCK_DATA, ...persisted };
    }
  },

  get() {
    this.init();
    return memoryStore;
  },

  save(data) {
    const prev = JSON.stringify(memoryStore);
    memoryStore = data;
    const next = JSON.stringify(data);

    try {
      localStorage.setItem("wedeazzy_admin_store", JSON.stringify({
        stats: data.stats,
        notifications: data.notifications
      }));
    } catch (e) {
      console.warn("Failed to persist admin store summary to localStorage:", e);
    }

    // Only fire if the in-memory data actually changed — prevents blink on every sync tick
    if (prev !== next) {
      window.dispatchEvent(new CustomEvent("wedeazzy_store_updated"));
    }
  },

  reset() {
    memoryStore = DEFAULT_MOCK_DATA;
    localStorage.setItem("wedeazzy_admin_store", JSON.stringify({
      stats: DEFAULT_MOCK_DATA.stats,
      notifications: DEFAULT_MOCK_DATA.notifications
    }));
    window.dispatchEvent(new CustomEvent("wedeazzy_store_updated"));
  },

  /**
   * Synchronize state store with the active database values via backend REST API
   */
  async sync() {
    const token = localStorage.getItem("wedeazzy_admin_token") || sessionStorage.getItem("wedeazzy_admin_token");
    if (!token) return;

    try {
      const headers = { 'Authorization': `Bearer ${token}` };

      // Throws on non-2xx (a 401/403/500 with a JSON error body used to
      // resolve fine here, so the `if (xRes.stats)`-style guards below just
      // skipped silently — the dashboard kept showing stale data with no
      // indication anything failed).
      const fetchJson = (url) => fetch(url, { headers }).then((r) => {
        if (!r.ok) throw new Error(`${url} -> HTTP ${r.status}`);
        return r.json();
      });

      const [analyticsRes, vendorsRes, usersRes, bookingsRes, paymentsRes] = await Promise.all([
        fetchJson(`${API_BASE}/api/admin/analytics`),
        fetchJson(`${API_BASE}/api/admin/vendors`),
        fetchJson(`${API_BASE}/api/admin/users`),
        fetchJson(`${API_BASE}/api/admin/bookings`),
        fetchJson(`${API_BASE}/api/reports/export/payments`).catch(() => ({ ok: false }))
      ]);

      const store = this.get();
      if (analyticsRes.stats) store.stats = analyticsRes.stats;
      if (vendorsRes.vendors) { store.vendors = vendorsRes.vendors; store.vendorsTotalCount = vendorsRes.totalCount ?? vendorsRes.vendors.length; }
      if (usersRes.users) { store.users = usersRes.users; store.usersTotalCount = usersRes.totalCount ?? usersRes.users.length; }
      if (bookingsRes.bookings) { store.bookings = bookingsRes.bookings; store.bookingsTotalCount = bookingsRes.totalCount ?? bookingsRes.bookings.length; }
      if (paymentsRes && paymentsRes.ok) store.payments = paymentsRes.data;

      // Extract venues list from vendors list where category = 'Banquet Halls' to keep compatibility
      if (vendorsRes.vendors) {
        store.venues = vendorsRes.vendors
          .filter(v => v.category === 'Banquet Halls')
          .map(v => ({
            id: v.id,
            name: v.name,
            location: v.address || '—',
            capacity: v.capacity != null ? v.capacity : null,
            price: v.price != null ? v.price : (v.priceMin != null ? v.priceMin : null),
            rating: v.rating,
            status: v.status,
            claims: v.claims,
            contact: v.contact
          }));
      }

      this.save(store);
    } catch (e) {
      console.warn("Failed to synchronize with administrative API:", e);
      // sync() polls every few seconds — throttle the toast so a backend
      // outage doesn't spam the admin with a new one on every tick, but do
      // surface it (previously this was console-only, so the admin had no
      // in-UI signal that the dashboard had gone stale).
      const now = Date.now();
      if (typeof window.showToast === 'function' && (!this._lastSyncErrorToast || now - this._lastSyncErrorToast > 60000)) {
        this._lastSyncErrorToast = now;
        window.showToast('Could not refresh dashboard data from the server — showing the last known data.', 'error');
      }
    }
  },

  // State Mutators synced with Backend APIs
  async updateBookingStatus(id, status) {
    const token = localStorage.getItem("wedeazzy_admin_token") || sessionStorage.getItem("wedeazzy_admin_token");
    try {
      const res = await fetch(`${API_BASE}/api/admin/bookings/${id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      await this.sync();
      return data;
    } catch (e) {
      console.error("Failed to update booking status:", e);
      return { ok: false, error: e.message };
    }
  },

  async updateVendorStatus(id, status) {
    const token = localStorage.getItem("wedeazzy_admin_token") || sessionStorage.getItem("wedeazzy_admin_token");
    try {
      const res = await fetch(`${API_BASE}/api/admin/vendors/${id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ isActive: status === 'approved' })
      });
      const data = await res.json();
      await this.sync();
      return data;
    } catch (e) {
      console.error("Failed to toggle vendor status:", e);
      return { ok: false, error: e.message };
    }
  },

  async inviteVendor(id) {
    const token = localStorage.getItem("wedeazzy_admin_token") || sessionStorage.getItem("wedeazzy_admin_token");
    try {
      const res = await fetch(`${API_BASE}/api/admin/vendors/${id}/invite`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      await this.sync();
      return data;
    } catch (e) {
      console.error("Failed to send claim invitation:", e);
      return { ok: false, error: e.message };
    }
  },

  async deleteVendor(id) {
    const token = localStorage.getItem("wedeazzy_admin_token") || sessionStorage.getItem("wedeazzy_admin_token");
    try {
      const res = await fetch(`${API_BASE}/api/admin/vendors/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      await this.sync();
      return await res.json();
    } catch (e) {
      console.error("Failed to delete vendor listing:", e);
      return { ok: false, error: e.message };
    }
  },

  async addVendor(vendor) {
    const token = localStorage.getItem("wedeazzy_admin_token") || sessionStorage.getItem("wedeazzy_admin_token");
    try {
      const res = await fetch(`${API_BASE}/api/admin/vendors`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: vendor.name,
          category: vendor.category,
          city: vendor.address || 'Mumbai',
          contact: vendor.contact,
          email: vendor.email
        })
      });
      await this.sync();
      return await res.json();
    } catch (e) {
      console.error("Failed to add vendor listing:", e);
    }
  },

  async updateVenueStatus(id, status) {
    const token = localStorage.getItem("wedeazzy_admin_token") || sessionStorage.getItem("wedeazzy_admin_token");
    try {
      const res = await fetch(`${API_BASE}/api/admin/vendors/${id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ isActive: status === 'approved' })
      });
      const data = await res.json();
      await this.sync();
      return data;
    } catch (e) {
      console.error("Failed to update venue status:", e);
      return { ok: false, error: e.message };
    }
  },

  async addVenue(venue) {
    const token = localStorage.getItem("wedeazzy_admin_token") || sessionStorage.getItem("wedeazzy_admin_token");
    try {
      const res = await fetch(`${API_BASE}/api/admin/venues`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: venue.name,
          location: venue.location,
          capacity: venue.capacity,
          price: venue.price,
          contact: venue.contact || '917498987620',
          email: venue.email || ''
        })
      });
      await this.sync();
      return await res.json();
    } catch (e) {
      console.error("Failed to create venue listing:", e);
    }
  },

  async claimListing(type, id) {
    const token = localStorage.getItem("wedeazzy_admin_token") || sessionStorage.getItem("wedeazzy_admin_token");
    try {
      const res = await fetch(`${API_BASE}/api/admin/vendors/${id}/verify`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ isVerified: true })
      });
      const data = await res.json();
      await this.sync();
      return data;
    } catch (e) {
      console.error("Failed to grant verification claim:", e);
      return { ok: false, error: e.message };
    }
  },

  async updateUserStatus(id, status) {
    const token = localStorage.getItem("wedeazzy_admin_token") || sessionStorage.getItem("wedeazzy_admin_token");
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status })
      });
      const data = await res.json();
      await this.sync();
      return data;
    } catch (e) {
      console.error("Failed to update user account status:", e);
      return { ok: false, error: e.message };
    }
  },

  markNotificationsRead() {
    const store = this.get();
    store.notifications.forEach(n => n.read = true);
    this.save(store);
  },

  clearAllNotifications() {
    const store = this.get();
    store.notifications = [];
    this.save(store);
  },

  async refundTransaction(id) {
    const token = localStorage.getItem("wedeazzy_admin_token") || sessionStorage.getItem("wedeazzy_admin_token");
    try {
      const res = await fetch(`${API_BASE}/api/admin/transactions/${id}/refund`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      await this.sync();
      return data;
    } catch (e) {
      console.error("Failed to refund transaction:", e);
      return { ok: false, message: e.message };
    }
  },

  async cancelVendorSubscription(id) {
    const token = localStorage.getItem("wedeazzy_admin_token") || sessionStorage.getItem("wedeazzy_admin_token");
    try {
      const res = await fetch(`${API_BASE}/api/admin/vendors/${id}/cancel-subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await res.json();
      await this.sync();
      return data;
    } catch (e) {
      console.error("Failed to cancel subscription:", e);
      return { ok: false, message: e.message };
    }
  },

  async updateVendorSubscription(id, subscriptionData) {
    const token = localStorage.getItem("wedeazzy_admin_token") || sessionStorage.getItem("wedeazzy_admin_token");
    try {
      const res = await fetch(`${API_BASE}/api/admin/vendors/${id}/subscription`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(subscriptionData)
      });
      const data = await res.json();
      await this.sync();
      return data;
    } catch (e) {
      console.error("Failed to update vendor subscription:", e);
      return { ok: false, message: e.message };
    }
  },

  async getPlans() {
    try {
      const res = await fetch(`${API_BASE}/api/public/plans`);
      const data = await res.json();
      return data;
    } catch (e) {
      console.error("Failed to fetch plans:", e);
      return { ok: false, message: e.message };
    }
  },

  async updatePlans(plans) {
    const token = localStorage.getItem("wedeazzy_admin_token") || sessionStorage.getItem("wedeazzy_admin_token");
    try {
      const res = await fetch(`${API_BASE}/api/admin/plans`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ plans })
      });
      const data = await res.json();
      await this.sync();
      return data;
    } catch (e) {
      console.error("Failed to update plans:", e);
      return { ok: false, message: e.message };
    }
  }
};

// Auto-initialize store
WedEazzyStore.init();

// Export to window scope
window.WedEazzyStore = WedEazzyStore;
