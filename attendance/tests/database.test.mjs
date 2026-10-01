import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

test('database workflow and authorization boundaries', async () => {
 const db = new PGlite();
 await db.exec(`create role anon; create role authenticated; create schema auth;
 create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb);
 create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;`);
 const migration = await readFile(new URL('../supabase/migrations/202610010001_attendance.sql', import.meta.url),'utf8');
 // Embedded PostgreSQL has no replication publication; all security/business SQL is unchanged.
 await db.exec(migration.replace('alter publication supabase_realtime add table public.attendance;', ''));
 const alice='00000000-0000-0000-0000-000000000001', bob='00000000-0000-0000-0000-000000000002', hr='00000000-0000-0000-0000-000000000003';
 for(const [id,name] of [[alice,'Alice'],[bob,'Bob'],[hr,'HR']]) await db.query(`insert into auth.users values($1,$2,$3)`,[id,`${name}@example.com`,JSON.stringify({full_name:name,role:'hr'})]);
 assert.equal((await db.query('select role from public.profiles where id=$1',[alice])).rows[0].role,'employee','metadata cannot elevate role');
 await db.query(`update public.profiles set role='hr' where id=$1`,[hr]);
 async function as(id, sql, params=[]) { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id]); await db.exec('set role authenticated'); return db.query(sql,params); }
 async function denied(id, sql, params=[]) { await assert.rejects(as(id,sql,params)); }
 const result=await as(alice,`select public.request_check_in('office') id`); const id=result.rows[0].id;
 await denied(alice,`select public.request_check_in('remote')`);
 await denied(alice,'select public.approve_check_in($1)',[id]);
 await denied(alice,'select public.check_out($1)',[id]);
 await denied(alice,`update public.attendance set in_time=now(), signature_approved=true where id=$1`,[id]);
 await denied(alice,`update public.profiles set role='hr' where id=$1`,[alice]);
 await denied(alice,`insert into public.attendance(employee_id,location) values($1,'office')`,[alice]);
 assert.equal((await as(bob,'select * from public.attendance')).rows.length,0);
 assert.equal((await as(alice,'select * from public.profiles')).rows.length,1);
 assert.equal((await as(hr,'select * from public.attendance')).rows.length,1);
 await as(hr,'select public.approve_check_in($1)',[id]);
 const approved=(await as(alice,'select * from public.attendance')).rows[0];
 assert.ok(approved.in_time); assert.ok(approved.work_date); assert.equal(approved.signature_approved,true); assert.equal(approved.hr_approved_by,hr);
 await denied(hr,'select public.approve_check_in($1)',[id]);
 await denied(bob,'select public.check_out($1)',[id]);
 await denied(alice,`select public.request_check_in('office')`);
 await as(alice,'select public.check_out($1)',[id]);
 const complete=(await as(hr,'select * from public.attendance')).rows[0];
 assert.ok(complete.out_time >= complete.in_time);
 await denied(alice,'select public.check_out($1)',[id]);
 await denied(alice,'delete from public.attendance where id=$1',[id]);
 const remote=(await as(alice,`select public.request_check_in('remote') id`)).rows[0].id;
 await as(hr,'select public.approve_check_in($1)',[remote]);
 await as(alice,'select public.check_out($1)',[remote]);
 assert.equal((await as(alice,'select * from public.attendance')).rows.length,2);
 await denied(alice,`select public.request_check_in('invalid')`);
 await denied(hr,`select public.request_check_in('office')`);
 await db.exec('reset role; set role anon');
 await assert.rejects(db.query('select * from public.attendance'));
 await assert.rejects(db.query("select public.request_check_in('office')"));
 await db.close();
});
