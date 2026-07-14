export const AUTH = {
  loginEmail: "login-email-input",
  loginPassword: "login-password-input",
  loginSubmit: "login-submit-button",
  registerName: "register-name-input",
  registerEmail: "register-email-input",
  registerPassword: "register-password-input",
  registerSubmit: "register-submit-button",
  logoutBtn: "logout-button",
};

export const NAV = {
  search: "nav-search",
  addCpq: "nav-add-cpq",
  import: "nav-import",
  users: "nav-users",
  brand: "nav-brand",
};

export const SEARCH = {
  input: "search-input",
  resultsTable: "search-results-table",
  row: (id) => `search-row-${id}`,
  partLink: (part) => `part-link-${part}`,
  emptyState: "search-empty-state",
};

export const PART = {
  header: "part-detail-header",
  currentPrice: "part-current-list-price",
  historyTable: "part-history-table",
  row: (id) => `part-history-row-${id}`,
  editBtn: (id) => `edit-record-${id}`,
  deleteBtn: (id) => `delete-record-${id}`,
};

export const CPQ_FORM = {
  cpqNumber: "cpq-number-input",
  cpqDate: "cpq-date-input",
  addLine: "add-line-button",
  removeLine: (i) => `remove-line-${i}`,
  linePart: (i) => `line-part-${i}`,
  lineUnit: (i) => `line-unit-${i}`,
  lineCustomer: (i) => `line-customer-${i}`,
  lineCpqPrice: (i) => `line-cpq-price-${i}`,
  lineQty: (i) => `line-qty-${i}`,
  lineDescription: (i) => `line-description-${i}`,
  lineNotes: (i) => `line-notes-${i}`,
  submit: "cpq-submit-button",
};

export const IMPORT = {
  fileInput: "import-file-input",
  uploadBtn: "import-upload-button",
  mapping: (field) => `import-map-${field}`,
  commitBtn: "import-commit-button",
  previewTable: "import-preview-table",
  previewCell: (field, row) => `import-cell-${field}-${row}`,
};

export const USERS = {
  inviteEmail: "invite-email-input",
  inviteName: "invite-name-input",
  invitePassword: "invite-password-input",
  inviteSubmit: "invite-submit-button",
  table: "users-table",
};

export const EDIT = {
  partNo: "edit-part-no",
  unitPrice: "edit-unit-price",
  cpqNumber: "edit-cpq-number",
  cpqDate: "edit-cpq-date",
  customer: "edit-customer",
  cpqPrice: "edit-cpq-price",
  qty: "edit-qty",
  description: "edit-description",
  notes: "edit-notes",
  submit: "edit-submit-button",
  cancel: "edit-cancel-button",
};
