/**
 * Prompt 11C — Centralized Plain Human & Professional Wording System
 * Natural, friendly, non-jargon labels and captions for Drop Cars Admin App.
 */

export const LABELS = {
  // Screen & Header Greetings
  dashboardCaptionOwner: 'Here is how the business is doing',
  dashboardCaptionStaffOnDuty: 'You are currently on duty',
  dashboardCaptionStaffOffDuty: 'You are currently off duty',

  // Section Headers
  sectionUrgentActions: 'Urgent actions',
  sectionLiveSnapshot: "Today's live snapshot",
  sectionQuickOperations: 'Quick operations',
  sectionBookingsDispatch: 'Bookings & dispatch',
  sectionEverythingElse: 'Control center',
  sectionPeopleFleet: 'Fleet & partners',
  sectionMoney: 'Money',
  sectionGrowthSettings: 'Growth & settings',
  sectionMyTasks: 'My tasks',

  // Task Strip
  taskStripPending: 'pending today',
  taskStripComplete: 'Complete all tasks',

  // Module Tiles & Rows (Title + Natural Caption)
  urgentEnquiries: {
    title: 'Enquiries',
    caption: 'Customers waiting for a call back',
  },
  urgentTripsWithoutDriver: {
    title: 'Upcoming bookings',
    caption: 'Awaiting driver assignment',
  },
  teamAndDuty: {
    title: 'Staff & duty',
    caption: 'Staff attendance, shifts and targets',
    tamilSub: 'அனைத்து செயல்பாடுகளும் ஒரே இடத்தில்',
  },
  ownFleet: {
    title: 'Own fleet',
    caption: 'Company cars, drivers, attendance & payroll',
  },
  urgentBids: {
    title: 'Urgent bids',
    caption: 'Live customer bids awaiting a driver',
  },
  driversAndCars: {
    title: 'Fleet & partners',
    caption: 'Fleet drivers, duty drivers, cars & vendors',
  },
  documentChecks: {
    title: 'Document checks',
    caption: 'Licence, RC, insurance',
  },
  payouts: {
    title: 'Payouts',
    caption: 'Withdrawal requests to approve',
  },
  gstInvoices: {
    title: 'GST invoices',
    caption: 'Invoices and tax filing',
  },
  websiteBookings: {
    title: 'Website bookings',
    caption: 'Approve and post to drivers',
  },
  staffAndRoles: {
    title: 'Staff & roles',
    caption: 'Targets, roles and permissions',
  },
  profileChanges: {
    title: 'Profile changes',
    caption: 'Approve name, photo and detail edits',
  },
  brandsAndWebsite: {
    title: 'Brands & website',
    caption: 'Connected brands and sites',
  },
  customersAndAds: {
    title: 'CRM & marketing',
    caption: 'Leads, follow-ups and promotions',
  },
  ratesAndSettings: {
    title: 'Rates & settings',
    caption: 'Fares, cities and app settings',
  },
  carChangeRequests: {
    title: 'Car change requests',
    caption: 'Drivers asking to swap the car',
  },
  customerFeedback: {
    title: 'Customer feedback',
    caption: 'Ratings after trips',
  },
  allBookings: {
    title: 'All bookings',
    caption: 'Every trip, any status',
  },

  // KPI Strip Labels
  kpiOnTheRoad: 'On the road',
  kpiBookingsToday: 'Bookings today',
  kpiCarsOnline: 'Cars online',
  kpiProfitToday: 'Profit today',
  kpiNewCustomers: 'New customers',

  // Buttons & Actions
  btnNewBooking: 'New booking',
  btnFareQuote: 'Fare quote',
  btnAddEnquiry: 'Add enquiry',
  btnLiveMap: 'Live map',
  btnGstInvoices: 'GST invoices',
  btnLeadQuote: 'Lead / Quote',
  btnCompleteTasks: 'Complete all tasks',
} as const;

export type LabelKey = keyof typeof LABELS;
