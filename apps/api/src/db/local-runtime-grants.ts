import type { Pool } from "pg";

/** Setup authority only. Caller creates a fresh nonprivileged role in a disposable local DB.
 * Never loads environment files, changes a role's attributes, or provisions remote roles. */
export async function grantLocalRuntime(setup: Pool, role: string) {
  if (!/^ruf_local_[a-f0-9]{16}$/.test(role)) throw new Error("An explicit disposable local runtime role is required.");
  const { rows } = await setup.query("select rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls from pg_roles where rolname=$1", [role]);
  if (rows.length !== 1 || Object.values(rows[0]).some(Boolean)) throw new Error("Runtime role must have no privileged attributes.");
  const target = `"${role}"`;
  await setup.query(`GRANT USAGE ON SCHEMA public TO ${target}`);
  await setup.query(`GRANT SELECT ON TABLE price_tier,company,company_product_line,company_machine,role,capability,role_capability,app_user,user_capability,user_scope,user_product_line_scope,user_account_scope,user_fleet_scope,dealer_customer_scope,session,password_reset_token,product_line,drawing_file,model,variant,system,model_system,figure,part,part_requires,figure_part,callout,diagram_mapping_revision,diagram_mapping,diagram_mapping_approval,publication_release,release_drawing,release_model,release_variant,release_system,release_figure,release_part,release_part_requires,release_figure_part,release_callout,release_diagram_mapping,drawing_upload_intent,idempotency_record TO ${target}`);
  await setup.query(`GRANT INSERT ON TABLE session,password_reset_token,drawing_file,drawing_upload_intent,diagram_mapping_revision,diagram_mapping_approval,publication_release,release_drawing,release_model,release_variant,release_system,release_figure,release_part,release_part_requires,release_figure_part,release_callout,release_diagram_mapping,audit_log,outbox_event,idempotency_record TO ${target}`);
  const updates: Record<string, string> = {
    app_user: "password_hash,updated_at,version", session: "idle_expires_at,last_used_at,updated_at,version,revoked_at",
    password_reset_token: "consumed_at,updated_at,version", model: "publication_version", variant: "id", part: "id", figure_part: "id",
    figure: "drawing_file_id,version,updated_at", callout: "figure_part_id,version", diagram_mapping: "current_revision_id,version",
    drawing_upload_intent: "state,finalized_drawing_id,finalized_at", publication_release: "status,published_at,activated_at",
    idempotency_record: "status,response,response_status,version",
  };
  for (const [table, columns] of Object.entries(updates)) await setup.query(`GRANT UPDATE (${columns}) ON TABLE ${table} TO ${target}`);
  // INSERT ... RETURNING requires SELECT on precisely the returned audit/outbox columns.
  await setup.query(`GRANT SELECT (id) ON TABLE audit_log,outbox_event TO ${target}`);
  await setup.query(`GRANT SELECT ON TABLE import_job,import_staging_row,import_issue,import_source_alias,import_issue_review TO ${target}`);
  await setup.query(`GRANT INSERT ON TABLE import_job,import_staging_row,import_issue,import_source_alias,import_issue_review,system,model_system,figure,part,figure_part,callout,diagram_mapping,part_requires TO ${target}`);
  await setup.query(`GRANT UPDATE (version,updated_at) ON TABLE model TO ${target}`);
  await setup.query(`GRANT UPDATE (qty,remarks,serviceable,effective_from,effective_to,version,updated_at) ON TABLE figure_part TO ${target}`);
  await setup.query(`GRANT UPDATE (state,summary,applied_at,version,updated_at) ON TABLE import_job TO ${target}`);
  await setup.query(`GRANT UPDATE (resolution,resolved_by_user_id,resolved_at,version,updated_at) ON TABLE import_issue TO ${target}`);
  await setup.query(`GRANT SELECT,INSERT ON TABLE import_quantity_review TO ${target}`);
  await setup.query(`GRANT UPDATE (quantity_semantics) ON TABLE figure_part TO ${target}`);
  await setup.query(`GRANT SELECT,INSERT ON TABLE catalog_depiction_review,release_depiction_review,release_source_reference TO ${target}`);
  await setup.query(`GRANT UPDATE (source_review_version) ON TABLE diagram_mapping TO ${target}`);
}
