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
  whatsappCampaigns: [],
  whatsappLogs: [],
  notifications: [],
  logs: []
};

// Global Store Wrapper
const WedEazzyStore = {
  init() {
    if (!localStorage.getItem("wedeazzy_admin_store")) {
      localStorage.setItem("wedeazzy_admin_store", JSON.stringify(DEFAULT_MOCK_DATA));
    }
  },

  get() {
    this.init();
    return JSON.parse(localStorage.getItem("wedeazzy_admin_store"));
  },

  save(data) {
    const prev = localStorage.getItem("wedeazzy_admin_store");
    const next = JSON.stringify(data);
    localStorage.setItem("wedeazzy_admin_store", next);
    // Only fire if the stored data actually changed — prevents blink on every sync tick
    if (prev !== next) {
      window.dispatchEvent(new CustomEvent("wedeazzy_store_updated"));
    }
  },

  reset() {
    localStorage.setItem("wedeazzy_admin_store", JSON.stringify(DEFAULT_MOCK_DATA));
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
      
      const [analyticsRes, vendorsRes, usersRes, bookingsRes, paymentsRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/analytics`, { headers }).then(r => r.json()),
        fetch(`${API_BASE}/api/admin/vendors`, { headers }).then(r => r.json()),
        fetch(`${API_BASE}/api/admin/users`, { headers }).then(r => r.json()),
        fetch(`${API_BASE}/api/admin/bookings`, { headers }).then(r => r.json()),
        fetch(`${API_BASE}/api/reports/export/payments`, { headers }).then(r => r.json()).catch(() => ({ ok: false }))
      ]);

      const store = this.get();
      if (analyticsRes.stats) store.stats = analyticsRes.stats;
      if (vendorsRes.vendors) store.vendors = vendorsRes.vendors;
      if (usersRes.users) store.users = usersRes.users;
      if (bookingsRes.bookings) store.bookings = bookingsRes.bookings;
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
    }
  },

  // State Mutators synced with Backend APIs
  async updateBookingStatus(id, status) {
    const token = localStorage.getItem("wedeazzy_admin_token") || sessionStorage.getItem("wedeazzy_admin_token");
    try {
      await fetch(`${API_BASE}/api/admin/bookings/${id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status })
      });
      await this.sync();
    } catch (e) {
      console.error("Failed to update booking status:", e);
    }
  },

  async updateVendorStatus(id, status) {
    const token = localStorage.getItem("wedeazzy_admin_token") || sessionStorage.getItem("wedeazzy_admin_token");
    try {
      await fetch(`${API_BASE}/api/admin/vendors/${id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ isActive: status === 'approved' })
      });
      await this.sync();
    } catch (e) {
      console.error("Failed to toggle vendor status:", e);
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
      await fetch(`${API_BASE}/api/admin/vendors/${id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ isActive: status === 'approved' })
      });
      await this.sync();
    } catch (e) {
      console.error("Failed to update venue status:", e);
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
          contact: venue.contact || '917498987620'
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
      await fetch(`${API_BASE}/api/admin/vendors/${id}/verify`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ isVerified: true })
      });
      await this.sync();
    } catch (e) {
      console.error("Failed to grant verification claim:", e);
    }
  },

  async updateUserStatus(id, status) {
    const token = localStorage.getItem("wedeazzy_admin_token") || sessionStorage.getItem("wedeazzy_admin_token");
    try {
      await fetch(`${API_BASE}/api/admin/users/${id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ status })
      });
      await this.sync();
    } catch (e) {
      console.error("Failed to update user account status:", e);
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
