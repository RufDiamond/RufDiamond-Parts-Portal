import {it,expect} from "vitest";
import {startPostgres} from "./helpers/postgres.js";
it('keeps invitation hashes private from browser roles even with inherited default grants',async()=>{
  const pg=await startPostgres();
  try{
    await pg.pool.query('CREATE ROLE anon; CREATE ROLE authenticated IN ROLE anon; CREATE ROLE service_role');
    await pg.pool.query('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon,authenticated,service_role');
    await pg.migrate();
    const rows=await pg.pool.query("select rolname,has_table_privilege(rolname,'public.account_invitation','SELECT') as readable,has_table_privilege(rolname,'public.account_invitation','INSERT') as writable from pg_roles where rolname in ('anon','authenticated','service_role')");
    expect(rows.rows).toHaveLength(3);for(const row of rows.rows){expect(row.readable).toBe(false);expect(row.writable).toBe(false);}
    expect((await pg.pool.query("select count(*)::int count from account_invitation")).rows[0].count).toBe(0);
  }finally{await pg.stop();}
},120000);
