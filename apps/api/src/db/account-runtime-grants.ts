import type { Pool } from "pg";

/** Operator/setup authority only; never creates roles or changes credentials. */
export async function grantAccountRuntime(setup:Pool,role:string) {
  if(!/^[a-z_][a-z0-9_]{0,62}$/.test(role))throw new Error('Supply a valid nonprivileged runtime role.');
  const check=await setup.query('select rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls from pg_roles where rolname=$1',[role]);
  if(check.rows.length!==1||Object.values(check.rows[0]).some(Boolean))throw new Error('Account runtime must not have privileged role attributes.');
  const target=`"${role}"`;
  await setup.query(`GRANT SELECT,INSERT ON account_invitation TO ${target}`);
  await setup.query(`GRANT UPDATE(consumed_at) ON account_invitation TO ${target}`);
  await setup.query(`GRANT INSERT ON app_user,user_scope TO ${target}`);
  await setup.query(`GRANT UPDATE(role_id,status,password_hash,updated_at,version) ON app_user TO ${target}`);
  await setup.query(`GRANT UPDATE(brand_mode,account_mode,fleet_mode,environment,price_tier_id,updated_at,version) ON user_scope TO ${target}`);
  await setup.query(`GRANT DELETE ON user_capability,user_product_line_scope,user_account_scope,user_fleet_scope TO ${target}`);
  await setup.query(`GRANT SELECT(object_id,capability) ON audit_log TO ${target}`);
}
