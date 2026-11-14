import assert from 'node:assert/strict';
import test from 'node:test';
import type { AppwriteDatabase } from '../database/appwrite';
import { CatalogRepository } from './catalogRepository';
import { catalogInputSchemas } from '../routes/catalogRoutes';

test('catalog schemas validate existing table columns and reject extras',()=>{
  assert.equal(catalogInputSchemas.avatars.safeParse({name:'Orbit',category:'shape',assetPath:'',isActive:true,sortOrder:1}).success,true);
  assert.equal(catalogInputSchemas.avatars.safeParse({name:'Orbit',category:'shape',assetPath:'',isActive:true,sortOrder:1,shape:4}).success,false);
  assert.equal(catalogInputSchemas.words.safeParse({word:'otter',category:'animal',difficulty:'easy',isActive:true}).success,true);
  assert.equal(catalogInputSchemas.words.safeParse({word:'x',category:'animal',difficulty:'easy',isActive:true}).success,false);
});

test('catalog repository creates, updates, audits and safely deletes unreferenced words',async()=>{
  const dbRows=new Map<string,Map<string,Record<string,unknown>>>();let next=0;
  const tables={
    async listRows(_db:string,table:string){return {rows:[...(dbRows.get(table)?.values()||[])],total:dbRows.get(table)?.size||0};},
    async createRow(_db:string,table:string,id:string,data:Record<string,unknown>){const row={$id:`row-${++next}`,...data};const rows=dbRows.get(table)||new Map();rows.set(row.$id,row);dbRows.set(table,rows);return row;},
    async updateRow(_db:string,table:string,id:string,data:Record<string,unknown>){const rows=dbRows.get(table)!;const before=rows.get(id)!;const row={...before,...data};rows.set(id,row);return row;},
    async deleteRow(_db:string,table:string,id:string){dbRows.get(table)?.delete(id);return {};},
  };
  const database={databaseId:'test',tables,newId:()=>`new-${++next}`} as unknown as AppwriteDatabase;
  const repo=new CatalogRepository(database);const actor={userId:'admin',username:'Admin',role:'admin'};
  await repo.save('words','word-1',{word:'otter',category:'animal',difficulty:'easy',isActive:true},actor);
  await repo.save('words','word-1',{word:'otter',category:'wildlife',difficulty:'medium',isActive:false},actor);
  assert.equal((await repo.list('words','WILD')).length,1);
  await repo.delete('words','word-1',actor);
  assert.equal((await repo.list('words')).length,0);
  assert.equal(dbRows.get('audit_logs')?.size,3);
});
