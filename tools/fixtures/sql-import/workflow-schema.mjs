// Synthetic DDL with descriptive defaults that convert to compact diagram labels.
export function workflowSchema() {
  const domains = ['access', 'accounts', 'assets', 'audit', 'billing', 'catalog', 'claims', 'contacts',
    'contracts', 'devices', 'inventory', 'invoices', 'leases', 'orders', 'payroll', 'pricing',
    'products', 'suppliers', 'tickets', 'training']
  const fields = ['brief', 'checklist', 'classification', 'escalation', 'exception', 'handover',
    'intake', 'notification', 'onboarding', 'outcome', 'overview', 'procedure', 'record',
    'referral', 'resolution', 'retention', 'review', 'schedule', 'summary']

  return domains.map(domain => {
    const defaults = fields.map(field => {
      const instructions = `Use the ${domain} workflow to review the ${field} with the responsible team before approval. Keep the ticket reference and the Zürich escalation contact in the audit log if a supervisor authorizes an exception. 日本語窓口へ連絡してください。`
      return `  ${field} varchar(255) NOT NULL DEFAULT '${instructions}'`
    })
    return `CREATE TABLE ${domain} (\n  id int PRIMARY KEY,\n${defaults.join(',\n')}\n);`
  }).join('\n')
}
